export interface CourseTemplate {
  paidUnits: number
  bonusUnits: number
  serviceIds: string[]
  validityDays: number | null
  branchIds: string[]
}

export interface CustomerCourse {
  id: string
  companyId: string
  customerId: string
  customerName: string
  saleId: string
  receiptNo: string
  branchId: string
  serviceId: string
  name: string
  template: CourseTemplate
  totalUnits: number
  usedUnits: number
  remainingUnits: number
  status: 'pending' | 'active' | 'cancelled'
  expiresAt: Date | null
  activatedAt: Date | null
  lastEventId: string
  createdAt: Date
}

export interface CourseRedemptionAllocation {
  courseId: string
  courseName: string
  serviceId: string
  units: number
  coveredAmount: number
  balanceBefore: number
  balanceAfter: number
  eventId?: string
  staffId?: string
  staffName?: string
  note?: string
}

export interface CourseEvent {
  id: string
  companyId: string
  customerId: string
  courseId: string
  kind: 'purchase' | 'activate' | 'use' | 'reverse' | 'cancel'
  units: number
  balance: number
  branchId: string
  userId: string
  userName: string
  staffId?: string
  staffName?: string
  serviceId?: string
  serviceName?: string
  note?: string
  reverseOf?: string
  usageSaleId?: string
  usageReceiptNo?: string
  lineIndex?: number
  createdAt: Date
}
