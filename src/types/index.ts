// ==========================================
// CORE TYPES - Hair Salon & Wig Shop ERP
// ==========================================

export type UserRole = 'super_admin' | 'owner' | 'branch_manager' | 'sales' | 'stylist' | 'staff' | 'accountant'

export type Status = 'active' | 'archived' | 'deleted'

// ==========================================
// BUSINESS & BRANCH
// ==========================================

export interface Company {
  id: string
  name: string
  nameEn?: string
  logo?: string
  taxId?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  lineOaId?: string
  status: Status
  createdAt: Date
  updatedAt: Date
}

export interface Branch {
  id: string
  companyId: string
  code: string // e.g. "01"
  name: string
  address?: string
  phone?: string
  email?: string
  receiptName?: string
  receiptAddress?: string
  receiptPhone?: string
  receiptEmail?: string
  receiptTaxId?: string
  receiptFooter?: string
  managerId?: string
  isMainBranch: boolean
  status: Status
  createdAt: Date
  updatedAt: Date
}

export interface ReceiptShopSnapshot {
  nameTh: string
  address?: string
  phone?: string
  email?: string
  taxId?: string
  logoUrl?: string
  receiptFooter?: string
  branchId?: string
  branchName?: string
  branchCode?: string
}

// ==========================================
// USER & STAFF
// ==========================================

export interface User {
  id: string
  companyId: string
  branchId?: string
  employeeId?: string
  email: string
  displayName: string
  phone?: string
  avatar?: string
  role: UserRole
  permissions: string[]
  isActive: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Employee {
  id: string
  companyId: string
  branchId: string
  userId?: string
  code: string
  firstName: string
  lastName: string
  nickname?: string
  phone?: string
  email?: string
  lineId?: string
  position: string
  department?: string
  startDate: Date
  commissionRate?: number
  status: Status
  createdAt: Date
  updatedAt: Date
}

// ==========================================
// CUSTOMER (CRM)
// ==========================================

export type CustomerCaseType = 'chemo' | 'thin_hair' | 'allergy' | 'bald' | 'post_surgery' | 'other'

export interface Customer {
  id: string
  companyId: string
  branchId: string
  customerId: string // Auto-generated e.g. "CUS-000001"
  firstName: string
  lastName: string
  nickname?: string
  phone: string
  lineId?: string
  birthDate?: Date
  address?: string
  caseTypes: string[] // CustomerCaseType or custom
  otherCaseNote?: string // free-text when 'other' is selected
  notes?: string
  // Head measurements for wig fitting (cm)
  headCircumference?: number // รอบศีรษะ
  headFrontBack?: number     // หน้า-หลัง
  headEarToEar?: number      // หู-หู
  headLeftRight?: number     // ซ้าย-ขวา
  memberId?: string
  memberLevel?: MemberLevel
  points?: number
  totalPurchase?: number
  status: Status
  createdAt: Date
  updatedAt: Date
}

export interface CustomerImage {
  id: string
  companyId: string
  customerId: string
  workCaseId?: string
  category: 'before' | 'after' | 'finished' | 'receipt' | 'wig_order' | 'document' | 'other'
  url: string
  thumbnail?: string
  caption?: string
  imageDate?: Date
  uploadedBy: string
  createdAt: Date
}

export type CustomerWorkCaseType = 'custom_wig' | 'ready_made' | 'repair'
export type CustomerRepairWorkType = 'reshape' | 'color' | 'add_hair' | 'replace_parts' | 'other'

export interface CustomerWorkCase {
  id: string
  companyId: string
  customerId: string
  branchId?: string
  type: CustomerWorkCaseType
  title: string
  caseDate: Date
  repairTypes?: CustomerRepairWorkType[]
  notes?: string
  status: Status
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface CustomerDocument {
  id: string
  companyId: string
  customerId: string
  type: 'id_card' | 'medical' | 'supporting' | 'other'
  name: string
  url: string
  uploadedBy: string
  createdAt: Date
}

export interface CustomerTimeline {
  id: string
  customerId: string
  type: 'appointment' | 'purchase' | 'service' | 'wig_order' | 'deposit' | 'payment' | 'status_change' | 'note'
  title: string
  description?: string
  referenceId?: string
  referenceType?: string
  amount?: number
  performedBy: string
  branchId: string
  createdAt: Date
}

// ==========================================
// MEMBERSHIP
// ==========================================

export type MemberLevel = 'silver' | 'gold' | 'platinum' | 'vip'

export interface MembershipConfig {
  id: string
  companyId: string
  pointsPerBaht: number // e.g. 1 point per 100 baht
  levels: MemberLevelConfig[]
  updatedAt: Date
}

export interface MemberLevelConfig {
  level: MemberLevel
  name: string
  minPurchase: number
  benefits: string[]
  pointMultiplier: number
}

export interface PointTransaction {
  id: string
  customerId: string
  type: 'earn' | 'redeem' | 'adjust' | 'expire'
  points: number
  referenceId?: string
  note?: string
  performedBy: string
  createdAt: Date
}

// ==========================================
// APPOINTMENTS
// ==========================================

export type AppointmentStatus = 'pending' | 'confirmed' | 'arrived' | 'completed' | 'cancelled'

export interface Appointment {
  id: string
  companyId: string
  branchId: string
  customerId: string
  customerName: string
  customerPhone: string
  stylistId?: string
  services: AppointmentService[]
  date: Date
  startTime: string
  endTime: string
  duration: number // minutes
  status: AppointmentStatus
  notes?: string
  confirmedAt?: Date
  confirmedBy?: string
  googleEventId?: string
  lineNotified: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface AppointmentService {
  serviceId: string
  serviceName: string
  price: number
  duration: number
  staffId?: string
}

// ==========================================
// SERVICES
// ==========================================

export interface Service {
  id: string
  companyId: string
  branchId?: string // null = global
  sourceBranchId?: string
  catalogScope?: 'shared' | 'branch'
  visibleBranchIds?: string[]
  excludedBranchIds?: string[]
  code: string
  name: string
  category: string
  price: number
  duration: number // minutes
  commissionRate?: number
  commissionAmount?: number
  taxType: 'vat' | 'non_vat'
  isActive: boolean
  notes?: string
  status: Status
  createdAt: Date
  updatedAt: Date
}

export interface ServiceRecord {
  id: string
  appointmentId?: string
  customerId: string
  serviceId: string
  serviceName: string
  staffId: string
  result?: string
  beforeImages?: string[]
  afterImages?: string[]
  recommendations?: string
  notes?: string
  branchId: string
  createdAt: Date
  updatedAt: Date
}

// ==========================================
// PRODUCTS
// ==========================================

export interface Product {
  id: string
  companyId: string
  branchId?: string
  sourceBranchId?: string
  catalogScope?: 'shared' | 'branch'
  visibleBranchIds?: string[]
  excludedBranchIds?: string[]
  sku: string
  barcode?: string
  name: string
  category: string
  description?: string
  images: string[]
  sellingPrice: number
  costPrice: number
  taxType: 'vat' | 'non_vat'
  isWigProduct: boolean // triggers work order on sale
  wigType?: string
  commissionRate?: number
  commissionAmount?: number
  minStockAlert?: number
  promotionPrice?: number
  promotionEnd?: Date
  notes?: string
  status: Status
  createdAt: Date
  updatedAt: Date
}

// ==========================================
// INVENTORY
// ==========================================

export interface Inventory {
  id: string
  companyId: string
  productId: string
  branchId: string // 'main' for main warehouse
  quantity: number
  reservedQty: number
  availableQty: number
  costPrice: number
  updatedAt: Date
}

export type TransferStatus = 'draft' | 'submitted' | 'approved' | 'in_transit' | 'received' | 'cancelled'

export interface TransferOrder {
  id: string
  companyId: string
  orderNo: string
  fromBranchId: string
  toBranchId: string
  items: TransferItem[]
  status: TransferStatus
  notes?: string
  requestedBy: string
  approvedBy?: string
  receivedBy?: string
  requestedAt: Date
  approvedAt?: Date
  receivedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface TransferItem {
  productId: string
  productName: string
  sku: string
  requestedQty: number
  approvedQty?: number
  receivedQty?: number
  costPrice: number
}

export interface StockMovement {
  id: string
  companyId: string
  branchId: string
  productId: string
  type: 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjust' | 'return' | 'cancel_return'
  quantity: number
  previousQty: number | null
  newQty: number | null
  isNegativeStock?: boolean
  negativeStockReason?: string
  approvedBy?: string
  referenceId?: string
  referenceType?: string
  costPrice: number
  notes?: string
  performedBy: string
  createdAt: Date
}

// ==========================================
// WIG PRODUCTION (WORK ORDER)
// ==========================================

export type ProductionStatus =
  | 'waiting'
  | 'in_production'
  | 'qc'
  | 'ready_to_ship'
  | 'shipped'
  | 'at_branch'
  | 'ready_to_pickup'
  | 'delivered'

export interface WorkOrder {
  id: string
  companyId: string
  branchId: string
  branchName?: string
  branchCode?: string
  receiptInfo?: ReceiptShopSnapshot
  orderNo: string // e.g. 0105690001
  customerId: string
  customerName: string
  saleOrderId: string
  saleReceiptNo?: string
  sourceType?: 'sale' | 'deposit' | 'manual'
  sourceNo?: string
  sourceItemId?: string
  sourceItemName?: string
  sourceItemQty?: number
  // Wig details
  wigType?: string
  wigColor?: string
  wigLength?: string
  wigModel?: string
  manufacturer?: string
  bagNumber?: string
  // Dates
  orderDate: Date
  expectedDate?: Date
  moldDate?: Date
  depositDate?: Date
  shippedDate?: Date
  receivedAtBranchDate?: Date
  deliveredDate?: Date
  // Status
  status: ProductionStatus
  progressImages: string[]
  completedImages: string[]
  notes?: string
  // Financials
  totalAmount: number
  depositAmount: number
  remainingAmount: number
  // Assignment
  assignedTo?: string
  performedBy: string
  createdAt: Date
  updatedAt: Date
}

// ==========================================
// DEPOSIT
// ==========================================

export type DepositStatus = 'pending' | 'deposited' | 'paid_full' | 'cancelled'

export interface Deposit {
  id: string
  companyId: string
  branchId: string
  branchName?: string
  branchCode?: string
  receiptInfo?: ReceiptShopSnapshot
  depositNo: string
  customerId: string
  customerName: string
  customerPhone?: string
  referenceId?: string // work order or sale
  referenceType?: 'work_order' | 'sale'
  items: DepositItem[]
  totalAmount: number
  preVatAmount?: number
  taxAmount?: number
  taxIncluded?: boolean
  showVatOnReceipt?: boolean
  depositAmount: number
  paidAmount: number
  remainingAmount: number
  status: DepositStatus
  notes?: string
  receiptNote?: string
  pickupDate?: string
  slipUrl?: string
  cancelReason?: string
  cancelledBy?: string
  cancelledByName?: string
  cancelledAt?: Date
  createdByName?: string
  receivedBy?: string
  receivedByName?: string
  paymentConfirmedByName?: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface DepositItem {
  productId?: string
  serviceId?: string
  name: string
  isWigProduct?: boolean
  wigType?: string
  quantity: number
  unitPrice: number
  originalUnitPrice?: number
  isPriceEdited?: boolean
  discountAmount?: number
  taxType?: 'vat' | 'non_vat'
  taxAmount?: number
  taxIncluded?: boolean
  total: number
  note?: string
}

// ==========================================
// POS & SALES
// ==========================================

export type PaymentMethod = 'cash' | 'transfer' | 'qr' | 'credit_card'

export type SaleStatus = 'pending' | 'completed' | 'returned' | 'cancelled'
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected'

export interface Sale {
  id: string
  companyId: string
  branchId: string
  receiptNo: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  items: SaleItem[]
  subtotal: number
  discountAmount: number
  discountPercent: number
  discountApprovedBy?: string
  discountReason?: string
  taxAmount: number
  preVatAmount?: number
  taxIncluded?: boolean
  showVatOnReceipt?: boolean
  totalAmount: number
  depositDeducted?: number
  payments: Payment[]
  paidAmount: number
  changeAmount: number
  status: SaleStatus
  paymentStatus?: PaymentStatus
  paymentConfirmedBy?: string
  paymentConfirmedByName?: string
  paymentConfirmedAt?: Date
  hasNegativeStockSale?: boolean
  negativeStockReason?: string
  negativeStockApprovedBy?: string
  negativeStockApprovedAt?: Date
  negativeStockItems?: Array<{
    id: string
    name: string
    sku?: string
    stockQty: number
    requestedQty: number
    shortageQty: number
  }>
  stockRestoredOnCancel?: boolean
  stockRestoredBy?: string
  stockRestoredByName?: string
  stockRestoredAt?: Date
  stockRestoreItems?: Array<{
    lineIndex?: number
    productId: string
    name: string
    sku?: string
    quantity: number
  }>
  cancelReason?: string
  cancelledBy?: string
  cancelledByName?: string
  cancelledAt?: Date
  notes?: string
  receiptNote?: string
  createdBy: string
  createdByName?: string
  receivedBy?: string
  receivedByName?: string
  branchName?: string
  branchCode?: string
  receiptInfo?: ReceiptShopSnapshot
  createdAt: Date
  updatedAt: Date
}

export interface SaleItem {
  type: 'product' | 'service'
  productId?: string
  serviceId?: string
  name: string
  sku?: string
  isWigProduct?: boolean
  wigType?: string
  quantity: number
  unitPrice: number
  originalUnitPrice?: number
  isPriceEdited?: boolean
  discountAmount: number
  taxType: 'vat' | 'non_vat'
  taxAmount: number
  taxIncluded?: boolean
  total: number
  note?: string
  staffId?: string
  staffName?: string
  commissionAmount?: number
  stockBefore?: number | null
  stockAfter?: number | null
  isNegativeStockSale?: boolean
  negativeStockQty?: number
  negativeStockReason?: string | null
  negativeStockApprovedBy?: string | null
}

export interface Payment {
  method: PaymentMethod
  amount: number
  reference?: string
  slipUrl?: string
  approvedBy?: string
  approvedAt?: Date
}

// ==========================================
// ACCOUNTING
// ==========================================

export interface Expense {
  id: string
  companyId: string
  branchId: string
  category: string
  description: string
  amount: number
  taxAmount?: number
  paymentMethod?: PaymentMethod
  receiptUrl?: string
  date: Date
  recordedBy: string
  approvedBy?: string
  status: Status
  createdAt: Date
  updatedAt: Date
}

// ==========================================
// COMMISSION
// ==========================================

export interface CommissionRecord {
  id: string
  companyId: string
  branchId: string
  employeeId: string
  saleId: string
  type: 'product' | 'service'
  itemName: string
  saleAmount: number
  commissionRate?: number
  commissionAmount: number
  status: 'pending' | 'approved' | 'paid' | 'cancelled'
  month: string // YYYY-MM
  createdAt: Date
  updatedAt: Date
}

// ==========================================
// DOCUMENTS
// ==========================================

export type DocumentType = 'quotation' | 'deposit_receipt' | 'receipt' | 'tax_invoice' | 'work_order'

export interface Document {
  id: string
  companyId: string
  branchId: string
  type: DocumentType
  documentNo: string
  referenceId: string
  referenceType: string
  customerId?: string
  customerName?: string
  amount: number
  pdfUrl?: string
  isEtaxReady: boolean
  createdBy: string
  createdAt: Date
}

// ==========================================
// NOTIFICATIONS
// ==========================================

export interface Notification {
  id: string
  companyId: string
  userId: string
  type: string
  title: string
  message: string
  link?: string
  isRead: boolean
  channel: 'in_app' | 'line' | 'email'
  createdAt: Date
}

// ==========================================
// ACTIVITY & AUDIT LOG
// ==========================================

export interface ActivityLog {
  id: string
  companyId: string
  branchId?: string
  userId: string
  userName: string
  action: string
  module: string
  description: string
  ipAddress?: string
  device?: string
  createdAt: Date
}

export interface AuditLog {
  id: string
  companyId: string
  branchId?: string
  userId: string
  userName: string
  module: string
  recordId: string
  field: string
  oldValue: string
  newValue: string
  createdAt: Date
}

// ==========================================
// DISCOUNT APPROVAL
// ==========================================

export interface DiscountRequest {
  id: string
  companyId: string
  branchId: string
  requestedBy: string
  approvedBy?: string
  saleId?: string
  discountPercent: number
  discountAmount: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: Date
  resolvedAt?: Date
}

// ==========================================
// SETTINGS
// ==========================================

export interface SystemSettings {
  id: string
  companyId: string
  taxRate: number
  currency: string
  pointsPerBaht: number
  lineOaToken?: string
  lineOaSecret?: string
  googleCalendarId?: string
  discountLimits: {
    sales: number
    branch_manager: number
    owner: number
  }
  backupEnabled: boolean
  sessionTimeout: number
  updatedBy: string
  updatedAt: Date
}
