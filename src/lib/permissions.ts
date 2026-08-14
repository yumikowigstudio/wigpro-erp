import { UserRole } from '@/types'

export type PermissionKey =
  | 'page.pos'
  | 'page.dashboard'
  | 'page.customers'
  | 'page.appointments'
  | 'page.members'
  | 'page.products'
  | 'page.inventory'
  | 'page.production'
  | 'page.returns'
  | 'page.transfers'
  | 'page.deposits'
  | 'page.quotations'
  | 'page.documents'
  | 'page.accounting'
  | 'page.commissions'
  | 'page.reports'
  | 'page.staff'
  | 'page.settings'
  | 'page.notifications'
  | 'action.sales.discount'
  | 'action.sales.confirmPayment'
  | 'action.sales.attachSlip'
  | 'action.sales.editBill'
  | 'action.sales.cancelBill'
  | 'action.inventory.adjust'
  | 'action.inventory.negativeStockSale'
  | 'action.reports.export'
  | 'action.users.manage'
  | 'action.branches.manage'
  | 'action.settings.manage'

export const PERMISSION_GROUPS: Array<{
  title: string
  description: string
  permissions: Array<{ key: PermissionKey; label: string; note?: string }>
}> = [
  {
    title: 'หน้าขายและลูกค้า',
    description: 'หน้าที่ใช้ประจำหน้าร้าน',
    permissions: [
      { key: 'page.pos', label: 'POS ขาย' },
      { key: 'page.customers', label: 'ลูกค้า' },
      { key: 'page.appointments', label: 'นัดหมาย' },
      { key: 'page.members', label: 'สมาชิก' },
      { key: 'page.deposits', label: 'มัดจำ' },
      { key: 'page.documents', label: 'ประวัติบิล/ใบเสร็จ' },
    ],
  },
  {
    title: 'สินค้าและสต๊อก',
    description: 'สินค้า คลัง โอน และงานผลิต',
    permissions: [
      { key: 'page.products', label: 'รายการสินค้า' },
      { key: 'page.inventory', label: 'สต๊อกสินค้า' },
      { key: 'page.production', label: 'งานผลิตวิก' },
      { key: 'page.returns', label: 'คืน/เปลี่ยนสินค้า' },
      { key: 'page.transfers', label: 'โอนสินค้า' },
      { key: 'action.inventory.adjust', label: 'ปรับสต๊อก', note: 'ถ้าไม่ได้เปิด ต้องให้เจ้าของร้านทำให้' },
    ],
  },
  {
    title: 'การเงินและรายงาน',
    description: 'เอกสาร ตัวเลข และข้อมูลสำคัญ',
    permissions: [
      { key: 'page.quotations', label: 'ใบเสนอราคา' },
      { key: 'page.accounting', label: 'บัญชี' },
      { key: 'page.commissions', label: 'คอมมิชชั่น' },
      { key: 'page.reports', label: 'รายงาน' },
      { key: 'action.reports.export', label: 'ส่งออกรายงาน' },
    ],
  },
  {
    title: 'คำสั่งที่ต้องระวัง',
    description: 'การแก้บิลและยืนยันเงิน',
    permissions: [
      { key: 'action.sales.discount', label: 'ให้ส่วนลดพิเศษ' },
      { key: 'action.sales.confirmPayment', label: 'ยืนยันการชำระเงิน' },
      { key: 'action.sales.attachSlip', label: 'แนบ/เปลี่ยนสลิปย้อนหลัง' },
      { key: 'action.sales.editBill', label: 'แก้ไขบิลย้อนหลัง' },
      { key: 'action.sales.cancelBill', label: 'ยกเลิกบิล' },
      { key: 'action.inventory.negativeStockSale', label: 'ขายสินค้าสต๊อกติดลบ', note: 'ควรเปิดให้เฉพาะเจ้าของร้านหรือผู้จัดการที่ได้รับอนุญาต' },
    ],
  },
  {
    title: 'จัดการระบบ',
    description: 'เปิดให้เฉพาะคนที่ไว้ใจได้',
    permissions: [
      { key: 'page.dashboard', label: 'แดชบอร์ด' },
      { key: 'page.staff', label: 'พนักงาน' },
      { key: 'page.settings', label: 'ตั้งค่า' },
      { key: 'page.notifications', label: 'การแจ้งเตือน' },
      { key: 'action.users.manage', label: 'จัดการผู้ใช้' },
      { key: 'action.branches.manage', label: 'จัดการสาขา' },
      { key: 'action.settings.manage', label: 'แก้ตั้งค่าร้าน' },
    ],
  },
]

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(group => group.permissions.map(item => item.key))

export const PAGE_PERMISSION_BY_PATH: Array<{ path: string; permission: PermissionKey }> = [
  { path: '/pos', permission: 'page.pos' },
  { path: '/dashboard', permission: 'page.dashboard' },
  { path: '/customers', permission: 'page.customers' },
  { path: '/appointments', permission: 'page.appointments' },
  { path: '/members', permission: 'page.members' },
  { path: '/products', permission: 'page.products' },
  { path: '/inventory', permission: 'page.inventory' },
  { path: '/production', permission: 'page.production' },
  { path: '/returns', permission: 'page.returns' },
  { path: '/transfers', permission: 'page.transfers' },
  { path: '/deposits', permission: 'page.deposits' },
  { path: '/quotations', permission: 'page.quotations' },
  { path: '/documents', permission: 'page.documents' },
  { path: '/accounting', permission: 'page.accounting' },
  { path: '/commissions', permission: 'page.commissions' },
  { path: '/reports', permission: 'page.reports' },
  { path: '/staff', permission: 'page.staff' },
  { path: '/settings', permission: 'page.settings' },
  { path: '/notifications', permission: 'page.notifications' },
]

const managerPermissions: PermissionKey[] = [
  'page.pos',
  'page.dashboard',
  'page.customers',
  'page.appointments',
  'page.members',
  'page.products',
  'page.inventory',
  'page.production',
  'page.returns',
  'page.transfers',
  'page.deposits',
  'page.quotations',
  'page.documents',
  'page.accounting',
  'page.commissions',
  'page.reports',
  'page.staff',
  'page.settings',
  'page.notifications',
  'action.sales.discount',
  'action.sales.confirmPayment',
  'action.sales.attachSlip',
  'action.sales.editBill',
  'action.sales.cancelBill',
  'action.inventory.adjust',
  'action.reports.export',
  'action.users.manage',
  'action.branches.manage',
  'action.settings.manage',
]

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  super_admin: ALL_PERMISSION_KEYS,
  owner: ALL_PERMISSION_KEYS,
  branch_manager: managerPermissions,
  sales: [
    'page.pos',
    'page.customers',
    'page.appointments',
    'page.members',
    'page.deposits',
    'page.documents',
    'page.notifications',
    'action.sales.confirmPayment',
    'action.sales.attachSlip',
  ],
  stylist: [
    'page.customers',
    'page.appointments',
    'page.production',
    'page.notifications',
  ],
  staff: [
    'page.pos',
    'page.customers',
    'page.appointments',
    'page.notifications',
    'action.sales.confirmPayment',
  ],
  accountant: [
    'page.dashboard',
    'page.deposits',
    'page.documents',
    'page.accounting',
    'page.commissions',
    'page.reports',
    'page.notifications',
    'action.reports.export',
  ],
}

export function getEffectivePermissions(role: UserRole, permissions?: string[]) {
  if (role === 'super_admin' || role === 'owner') return ALL_PERMISSION_KEYS
  const effective = permissions && permissions.length > 0 ? permissions : DEFAULT_ROLE_PERMISSIONS[role]
  const normalized = new Set(effective)

  // คนที่เปิด POS ได้ควรบันทึกรับเงินหน้าร้านได้จริง ส่วนลด/แก้บิล/ยกเลิกบิลยังแยกสิทธิ์ไว้ต่างหาก
  if ((role === 'staff' || role === 'sales') && normalized.has('page.pos')) {
    normalized.add('action.sales.confirmPayment')
  }

  return Array.from(normalized) as PermissionKey[]
}

export function getPagePermission(pathname: string) {
  return PAGE_PERMISSION_BY_PATH.find(item => pathname === item.path || pathname.startsWith(`${item.path}/`))?.permission
}
