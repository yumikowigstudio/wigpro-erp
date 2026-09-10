import test from 'node:test'
import assert from 'node:assert/strict'
import { assertRedeemable, courseExpiry, validateCourse } from '../src/lib/courseMath'
import { allocateOrderPayments } from '../src/lib/workOrderAmounts'
import type { CourseTemplate, CustomerCourse } from '../src/lib/courseTypes'

const template: CourseTemplate = { paidUnits: 10, bonusUnits: 2, validityDays: 365, serviceIds: ['wash'], branchIds: [] }
test('course bought and bonus units validate independently', () => {
  validateCourse(template)
  assert.throws(() => validateCourse({ ...template, paidUnits: 0 }))
  assert.throws(() => validateCourse({ ...template, bonusUnits: 1.5 }))
  assert.throws(() => validateCourse({ ...template, serviceIds: [] }))
  assert.equal(courseExpiry({ ...template, validityDays: null }, new Date()), null)
  assert.equal(courseExpiry(template, new Date('2026-01-01T00:00:00Z'))?.toISOString(), '2027-01-01T00:00:00.000Z')
})
test('redeem validates status, expiry, branch, service and whole units', () => {
  const course = { status: 'active', remainingUnits: 12, template, expiresAt: null } as CustomerCourse
  assertRedeemable(course, 'wash', 'other-branch', 1)
  assert.throws(() => assertRedeemable(course, 'color', 'main', 1))
  assert.throws(() => assertRedeemable(course, 'wash', 'main', 13))
  assert.throws(() => assertRedeemable(course, 'wash', 'main', 0.5))
  assert.throws(() => assertRedeemable({ ...course, status: 'pending' }, 'wash', 'main', 1))
  assert.throws(() => assertRedeemable({ ...course, expiresAt: new Date('2020-01-01') }, 'wash', 'main', 1))
  assert.throws(() => assertRedeemable({ ...course, template: { ...template, branchIds: ['main'] } }, 'wash', 'other', 1))
})
test('order payments share bill credit without multiplying it', () => {
  assert.deepEqual(allocateOrderPayments([600, 400], 1200, 600), [300, 200])
  assert.deepEqual(allocateOrderPayments([100, 100, 100], 300, 100), [33.34, 33.33, 33.33])
  assert.deepEqual(allocateOrderPayments([0], 0, 0), [0])
  assert.deepEqual(allocateOrderPayments([100, 100], 200, 250), [100, 100])
  for (let paid = 0; paid < 300; paid += 0.17) assert.ok(allocateOrderPayments([100, 100], 300, paid).reduce((sum, value) => sum + value, 0) <= Math.round(paid * 100) / 100 + 0.000001)
})
