import type { CourseTemplate, CustomerCourse } from './courseTypes'

export function validateCourse(template: CourseTemplate) {
  if (!Number.isInteger(template.paidUnits) || template.paidUnits < 1 || template.paidUnits > 10000
    || !Number.isInteger(template.bonusUnits) || template.bonusUnits < 0 || template.bonusUnits > 10000
    || !template.serviceIds.length || new Set(template.serviceIds).size !== template.serviceIds.length
    || (template.validityDays !== null && (!Number.isInteger(template.validityDays) || template.validityDays < 1 || template.validityDays > 3650))) {
    throw new Error('ตรวจจำนวนครั้ง บริการที่ใช้สิทธิ์ และอายุคอร์สให้ครบถ้วน')
  }
}

export function courseExpiry(template: CourseTemplate, activatedAt: Date) {
  return template.validityDays === null ? null : new Date(activatedAt.getTime() + template.validityDays * 86400000)
}

export function assertRedeemable(course: CustomerCourse, serviceId: string, branchId: string, units: number, now = new Date()) {
  if (course.status !== 'active') throw new Error('คอร์สยังไม่เปิดใช้หรือถูกยกเลิกแล้ว')
  if (course.expiresAt && course.expiresAt <= now) throw new Error('คอร์สหมดอายุแล้ว')
  if (!course.template.serviceIds.includes(serviceId)) throw new Error('บริการนี้ไม่อยู่ในคอร์ส')
  if (course.template.branchIds.length && !course.template.branchIds.includes(branchId)) throw new Error('คอร์สนี้ไม่สามารถใช้ที่สาขาที่เลือก')
  if (!Number.isInteger(units) || units < 1 || units > course.remainingUnits) throw new Error('จำนวนครั้งไม่ถูกต้องหรือสิทธิ์คงเหลือไม่เพียงพอ')
}
