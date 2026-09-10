import { doc, runTransaction, serverTimestamp, type Transaction, type DocumentSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS, convertTimestamps } from './firestore'
import { assertRedeemable, courseExpiry, validateCourse } from './courseMath'
import { writeTransactionLog } from './transactionStock'
import type { CourseTemplate, CustomerCourse, CourseEvent } from './courseTypes'
import type { Sale } from '@/types'
import { runIdempotentTransaction } from './idempotentTransaction'

export type CourseActor = { userId: string; userName: string; branchId: string }

export function writeCoursePurchases(tx: Transaction, saleId: string, sale: Sale, actor: CourseActor) {
  const ids: string[] = []
  sale.items.forEach((item, index) => {
    if (!item.course) return
    validateCourse(item.course)
    if (!sale.customerId) throw new Error('กรุณาเลือกลูกค้าก่อนขายคอร์ส')
    for (let unit = 0; unit < item.quantity; unit++) {
      const id = `${saleId}_${index}_${unit}`
      const eventId = `${id}_purchase`
      const active = sale.paymentStatus === 'confirmed'
      const now = new Date()
      const totalUnits = item.course.paidUnits + item.course.bonusUnits
      ids.push(id)
      tx.set(doc(db, COLLECTIONS.CUSTOMER_COURSES, id), {
        companyId: sale.companyId, customerId: sale.customerId, customerName: sale.customerName || '',
        saleId, receiptNo: sale.receiptNo, branchId: sale.branchId, serviceId: item.serviceId,
        lineIndex: index, unitIndex: unit,
        name: item.name, template: item.course, totalUnits, usedUnits: 0, remainingUnits: totalUnits,
        status: active ? 'active' : 'pending', activatedAt: active ? serverTimestamp() : null,
        expiresAt: active ? courseExpiry(item.course, now) : null, lastEventId: eventId,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      tx.set(doc(db, COLLECTIONS.COURSE_EVENTS, eventId), {
        companyId: sale.companyId, customerId: sale.customerId, courseId: id, kind: 'purchase',
        units: totalUnits, balance: totalUnits, ...actor, createdAt: serverTimestamp(),
      })
    }
  })
  return ids
}

export async function readSaleCourses(tx: Transaction, sale: Sale) {
  return Promise.all((sale.courseIds ?? []).map(id => tx.get(doc(db, COLLECTIONS.CUSTOMER_COURSES, id))))
}

export function activateSaleCourses(tx: Transaction, courses: DocumentSnapshot[], actor: CourseActor) {
  for (const snap of courses) {
    if (!snap.exists() || snap.data().status !== 'pending') continue
    const data = snap.data()
    const eventId = `${snap.id}_activate`
    tx.update(snap.ref, { status: 'active', activatedAt: serverTimestamp(), expiresAt: courseExpiry(data.template as CourseTemplate, new Date()), lastEventId: eventId, updatedAt: serverTimestamp() })
    tx.set(doc(db, COLLECTIONS.COURSE_EVENTS, eventId), { companyId: data.companyId, customerId: data.customerId,
      courseId: snap.id, kind: 'activate', units: 0, balance: data.remainingUnits, ...actor, createdAt: serverTimestamp() })
  }
}

export function writeCourseCancellation(tx: Transaction, snap: DocumentSnapshot, actor: CourseActor, reason: string) {
  if (!snap.exists() || snap.data().status === 'cancelled') return
  const data = snap.data()
  const eventId = `${snap.id}_cancel`
  tx.update(snap.ref, { status: 'cancelled', remainingUnits: 0, lastEventId: eventId, updatedAt: serverTimestamp() })
  tx.set(doc(db, COLLECTIONS.COURSE_EVENTS, eventId), { companyId: data.companyId, customerId: data.customerId,
    courseId: snap.id, kind: 'cancel', units: data.remainingUnits, balance: 0, note: reason, ...actor, createdAt: serverTimestamp() })
}

export async function redeemCourse(input: { id: string; course: CustomerCourse; serviceId: string; units: number; staffId: string; note: string; actor: CourseActor }) {
  if (!input.staffId) throw new Error('กรุณาเลือกพนักงานผู้ให้บริการ')
  const matches = (data: Record<string, unknown>) => data.companyId === input.course.companyId && data.courseId === input.course.id && data.kind === 'use' && data.units === input.units && data.serviceId === input.serviceId && data.staffId === input.staffId && data.branchId === input.actor.branchId && data.note === input.note.trim()
  await runIdempotentTransaction(doc(db, COLLECTIONS.COURSE_EVENTS, input.id), matches, async tx => {
    const ref = doc(db, COLLECTIONS.CUSTOMER_COURSES, input.course.id)
    const eventRef = doc(db, COLLECTIONS.COURSE_EVENTS, input.id)
    const prior = await tx.get(eventRef)
    if (prior.exists()) {
      if (!matches(prior.data())) throw new Error('รายการนี้บันทึกแล้ว กรุณาตรวจประวัติก่อนทำรายการใหม่')
      return
    }
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().companyId !== input.course.companyId || snap.data().customerId !== input.course.customerId) throw new Error('ไม่พบคอร์สของลูกค้า')
    const course = { id: snap.id, ...convertTimestamps(snap.data()) } as CustomerCourse
    assertRedeemable(course, input.serviceId, input.actor.branchId, input.units)
    const sale = await tx.get(doc(db, COLLECTIONS.SALES, course.saleId))
    if (!sale.exists() || sale.data().status === 'cancelled' || sale.data().paymentStatus !== 'confirmed') throw new Error('บิลต้นทางยังไม่ยืนยันชำระหรือถูกยกเลิก')
    const service = await tx.get(doc(db, COLLECTIONS.SERVICES, input.serviceId))
    const staff = await tx.get(doc(db, COLLECTIONS.EMPLOYEES, input.staffId))
    const branch = await tx.get(doc(db, COLLECTIONS.BRANCHES, input.actor.branchId))
    if (!service.exists() || service.data().companyId !== course.companyId || service.data().course) throw new Error('ไม่พบบริการที่ใช้สิทธิ์')
    if (!staff.exists() || staff.data().companyId !== course.companyId || staff.data().status !== 'active') throw new Error('พนักงานไม่พร้อมให้บริการ')
    if (!branch.exists() || branch.data().companyId !== course.companyId || branch.data().isActive === false || ['inactive', 'archived'].includes(branch.data().status)) throw new Error('ไม่พบสาขาที่เปิดใช้งาน')
    const balance = course.remainingUnits - input.units
    const staffName = String(staff.data().displayName || `${staff.data().firstName || ''} ${staff.data().lastName || ''}`).trim()
    tx.update(ref, { usedUnits: course.usedUnits + input.units, remainingUnits: balance, lastEventId: input.id, updatedAt: serverTimestamp() })
    tx.set(eventRef, { companyId: course.companyId, customerId: course.customerId, courseId: course.id, kind: 'use',
      units: input.units, balance, serviceId: input.serviceId, serviceName: service.data().name, staffId: input.staffId, staffName,
      note: input.note.trim(), ...input.actor, createdAt: serverTimestamp() })
    tx.set(doc(db, COLLECTIONS.SERVICE_RECORDS, input.id), { companyId: course.companyId, customerId: course.customerId,
      courseId: course.id, courseEventId: input.id, branchId: input.actor.branchId, serviceId: input.serviceId,
      serviceName: service.data().name, staffId: input.staffId, notes: input.note.trim(), beforeImages: [], afterImages: [],
      reversed: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: course.companyId, ...input.actor, action: 'update', module: 'คอร์ส',
      recordId: course.id, recordType: 'course', description: `ใช้คอร์ส ${course.name} ${input.units} ครั้ง คงเหลือ ${balance} ครั้ง` })
  })
}

export async function reverseCourseUse(course: CustomerCourse, event: CourseEvent, actor: CourseActor, reason: string) {
  if (!reason.trim()) throw new Error('กรุณาระบุเหตุผลคืนสิทธิ์')
  const id = `${event.id}_reverse`
  await runIdempotentTransaction(doc(db, COLLECTIONS.COURSE_EVENTS, id), data => data.companyId === course.companyId && data.courseId === course.id && data.kind === 'reverse' && data.reverseOf === event.id, async tx => {
    const prior = await tx.get(doc(db, COLLECTIONS.COURSE_EVENTS, id))
    if (prior.exists()) return
    const snap = await tx.get(doc(db, COLLECTIONS.CUSTOMER_COURSES, course.id))
    const original = await tx.get(doc(db, COLLECTIONS.COURSE_EVENTS, event.id))
    if (!snap.exists() || snap.data().companyId !== course.companyId || snap.data().status !== 'active'
      || !original.exists() || original.data().kind !== 'use' || original.data().courseId !== course.id) throw new Error('ไม่สามารถคืนสิทธิ์รายการนี้ได้')
    const units = Number(original.data().units)
    if (units > snap.data().usedUnits) throw new Error('ยอดใช้สิทธิ์ไม่ตรงกับประวัติ')
    const balance = Number(snap.data().remainingUnits) + units
    tx.update(snap.ref, { usedUnits: Number(snap.data().usedUnits) - units, remainingUnits: balance, lastEventId: id, updatedAt: serverTimestamp() })
    tx.set(doc(db, COLLECTIONS.COURSE_EVENTS, id), { companyId: course.companyId, customerId: course.customerId, courseId: course.id,
      kind: 'reverse', reverseOf: event.id, units, balance, note: reason.trim(), ...actor, createdAt: serverTimestamp() })
    tx.update(doc(db, COLLECTIONS.SERVICE_RECORDS, event.id), { reversed: true, updatedAt: serverTimestamp() })
    writeTransactionLog(tx, { companyId: course.companyId, ...actor, action: 'update', module: 'คอร์ส', recordId: course.id,
      recordType: 'course', description: `คืนสิทธิ์ ${units} ครั้ง: ${reason}` })
  })
}

export async function cancelCourseRights(course: CustomerCourse, actor: CourseActor, reason: string) {
  if (!reason.trim()) throw new Error('กรุณาระบุเหตุผลยุติสิทธิ์')
  await runTransaction(db, async tx => {
    const snap = await tx.get(doc(db, COLLECTIONS.CUSTOMER_COURSES, course.id))
    if (!snap.exists() || snap.data().companyId !== course.companyId) throw new Error('ไม่พบคอร์ส')
    writeCourseCancellation(tx, snap, actor, reason.trim())
    writeTransactionLog(tx, { companyId: course.companyId, ...actor, action: 'cancel', module: 'คอร์ส', recordId: course.id,
      recordType: 'course', description: `ยุติสิทธิ์คงเหลือ ${course.name} (ไม่บันทึกคืนเงิน): ${reason}` })
  })
}
