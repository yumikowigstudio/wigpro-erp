'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Search, Plus, Minus, X, ShoppingCart, Tag,
  Banknote, Smartphone, QrCode, CreditCard, Package,
  Scissors, Check, Loader2, AlertTriangle, Printer, Wallet, Ticket,
  UserRound, FileText, ImagePlus, Factory,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { addDocument, COLLECTIONS, convertTimestamps, generateBranchDocumentNo, generateWigOrderNo } from '@/lib/firestore'
import { Sale, Product, Service, Deposit, WorkOrder, Employee, Branch, ReceiptShopSnapshot } from '@/types'
import { collection, onSnapshot, query, where, getDoc, getDocs, doc, limit, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { CustomerSearchInput } from '@/components/CustomerSearchInput'
import { adjustBranchStock } from '@/lib/stock'

type ProductWithStock = Product & { stockQty?: number }
type PosMode = 'sale' | 'deposit'

interface StockPolicy {
  allowNegativeStock: boolean
  requireNegativeStockReason: boolean
  negativeStockManagerOnly: boolean
}

interface DiscountPolicy {
  sales: number
  branchManager: number
  owner: number
}

interface StockShortage {
  id: string
  name: string
  sku?: string
  stockQty: number
  requestedQty: number
  shortageQty: number
}

interface CartItem {
  id: string; type: 'product' | 'service'; name: string; sku?: string
  price: number; quantity: number; taxType: 'vat' | 'non_vat'; stockQty?: number
  note?: string
  costPrice?: number
  isWigProduct?: boolean; wigType?: string
  staffId?: string; staffName?: string          // พนักงานที่ขายรายการนี้ (สำหรับคิดคอม)
  commissionRate?: number; commissionAmount?: number  // config คอมจากตัวสินค้า/บริการ
}

interface ReceiptData {
  mode:         PosMode
  receiptNo:    string
  customerName: string
  items:        CartItem[]
  subtotal:     number
  discountAmt:  number
  preVatAmount: number
  vatAmt:       number
  total:        number
  showVatOnReceipt: boolean
  taxIncluded:  boolean
  depositAmt:   number
  remaining:    number
  pickupDate:   string   // วันนัดรับวิก
  depositNote:  string
  payMethod:    string
  paidAmount:   number
  change:       number
  date:         Date
  branchName?:  string
  branchCode?:  string
  shopInfo?:     ReceiptShopSnapshot
  saleId?:       string
  depositId?:    string
  customerId?:   string
  workOrderCreatedCount?: number
  receiverName:  string
}

const DEFAULT_STOCK_POLICY: StockPolicy = {
  allowNegativeStock: false,
  requireNegativeStockReason: true,
  negativeStockManagerOnly: true,
}

const DEFAULT_DISCOUNT_POLICY: DiscountPolicy = {
  sales: 5,
  branchManager: 15,
  owner: 100,
}

interface ShopInfo {
  nameTh:         string
  taxId?:         string
  phone?:         string
  email?:         string
  address?:       string
  logoUrl?:       string
  receiptFooter?: string
  branchId?:      string
  branchName?:    string
  branchCode?:    string
}

const payMethods = [
  { id: 'cash',        label: 'เงินสด',     icon: Banknote,   color: 'from-emerald-400 to-emerald-500' },
  { id: 'transfer',    label: 'โอนเงิน',    icon: Smartphone, color: 'from-blue-400 to-blue-500'       },
  { id: 'qr',          label: 'QR',          icon: QrCode,     color: 'from-purple-400 to-purple-500'   },
  { id: 'credit_card', label: 'บัตรเครดิต', icon: CreditCard, color: 'from-[#f472b6] to-[#e879a0]'    },
]

const WIG_TYPE_OPTIONS = ['ฮาฟวิก', 'ฟูวิก', 'วิกกึ่งฟู', 'ฟูวิกญี่ปุ่น', 'อื่นๆ']
const VAT_RATE = 0.07

export default function POSPage() {
  const { companyId, branchId, userId, currentBranch, user } = useAuth()
  const cashierName = user?.displayName?.trim() || user?.email?.trim() || userId
  const { ensurePermission, hasPermission } = usePermissionAction()
  const [products, setProducts]       = useState<ProductWithStock[]>([])
  const [branchStock, setBranchStock] = useState<Record<string, number>>({})
  const [services, setServices]       = useState<Service[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [cart, setCart]               = useState<CartItem[]>([])
  const [search, setSearch]           = useState('')
  const [tab, setTab]                 = useState<'products' | 'services'>('products')
  const [filterCat, setFilterCat]     = useState('ทั้งหมด')
  const [discount, setDiscount]       = useState(0)
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent')
  const [payMethod, setPayMethod]     = useState('cash')
  const [cash, setCash]               = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerId,   setCustomerId]   = useState('')
  const [mode, setMode]               = useState<PosMode>('sale')
  const [showVatOnReceipt, setShowVatOnReceipt] = useState(false)
  const [depositInput, setDepositInput] = useState('')
  const [pickupDate, setPickupDate]   = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [saving, setSaving]           = useState(false)
  const [posMsg, setPosMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [receipt, setReceipt]         = useState<ReceiptData | null>(null)
  const [shopInfo, setShopInfo]       = useState<ShopInfo>({ nameTh: 'ร้านของฉัน' })
  const [stockPolicy, setStockPolicy] = useState<StockPolicy>(DEFAULT_STOCK_POLICY)
  const [discountPolicy, setDiscountPolicy] = useState<DiscountPolicy>(DEFAULT_DISCOUNT_POLICY)
  const [employees, setEmployees]     = useState<Employee[]>([])
  const [defaultStaffId, setDefaultStaffId] = useState('')   // พนักงานขายเริ่มต้น (ใส่ให้ทุกรายการที่หยิบใหม่)
  const [couponCode, setCouponCode]   = useState('')         // รหัสคูปอง
  const [appliedCoupon, setAppliedCoupon] = useState('')     // ชื่อคูปองที่ใช้แล้ว
  const [slipUrl, setSlipUrl]         = useState('')         // หลักฐานการชำระ (สลิป) สำหรับโอน/QR/บัตร
  const [slipUploading, setSlipUploading] = useState(false)
  const [paymentConfirm, setPaymentConfirm] = useState<PosMode | null>(null)
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [negativeStockReason, setNegativeStockReason] = useState('')
  const [expandedCartItemId, setExpandedCartItemId] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [openDeposits, setOpenDeposits] = useState<Deposit[]>([])  // มัดจำค้างของลูกค้าที่เลือก
  const [appliedDepositId, setAppliedDepositId] = useState('')     // มัดจำที่เลือกหักในบิลนี้
  const [createWorkOrder, setCreateWorkOrder] = useState(true)
  const [wigSpec, setWigSpec]         = useState({ wigType: '', wigColor: '', wigLength: '', wigModel: '', manufacturer: '' })

  useEffect(() => {
    if (!companyId) return
    let p = false, s = false
    const check = () => { if (p && s) setDataLoading(false) }
    const sortByName = <T extends { name: string }>(arr: T[]) =>
      [...arr].sort((a, b) => a.name.localeCompare(b.name, 'th'))
    // limit(1000) เป็น safety cap — POS แสดงรายการให้เลือกเท่านั้น ไม่ได้คำนวณยอดรวม
    // ร้านจริงมีสินค้า/บริการที่ active ไม่ถึงพัน จึงไม่กระทบการใช้งาน แต่กันโหลดหนักถ้าข้อมูลโตผิดปกติ
    const u1 = onSnapshot(
      query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId), where('isActive', '==', true), limit(1000)),
      snap => { setProducts(sortByName(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as ProductWithStock[])); p = true; check() },
      () => { p = true; check() }
    )
    const u2 = onSnapshot(
      query(collection(db, COLLECTIONS.SERVICES), where('companyId', '==', companyId), limit(1000)),
      snap => { setServices(sortByName(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Service[])); s = true; check() },
      () => { s = true; check() }
    )
    // พนักงาน (active) สำหรับเลือกผู้ขาย/คิดคอม
    const u3 = onSnapshot(
      query(collection(db, COLLECTIONS.EMPLOYEES), where('companyId', '==', companyId), where('status', '==', 'active'), limit(500)),
      snap => setEmployees(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Employee[]),
      () => {}
    )

    return () => { u1(); u2(); u3() }
  }, [companyId])

  useEffect(() => {
    if (!companyId || !branchId) {
      setBranchStock({})
      return
    }
    const q = query(
      collection(db, COLLECTIONS.INVENTORY),
      where('companyId', '==', companyId),
      where('branchId', '==', branchId),
    )
    return onSnapshot(q, snap => {
      const next: Record<string, number> = {}
      snap.docs.forEach(d => {
        const data = d.data() as { productId?: string; quantity?: number }
        if (data.productId) next[data.productId] = Number(data.quantity ?? 0)
      })
      setBranchStock(next)
    }, () => setBranchStock({}))
  }, [branchId, companyId])

  useEffect(() => {
    if (!companyId) return
    let active = true
    const readString = (value: unknown) => typeof value === 'string' ? value.trim() : ''

    Promise.all([
      getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId)),
      getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${companyId}_tax`)),
      branchId ? getDoc(doc(db, COLLECTIONS.BRANCHES, branchId)) : Promise.resolve(null),
    ]).then(([company, tax, branch]) => {
      if (!active) return
      const c = company.exists() ? company.data() : {}
      const t = tax.exists() ? tax.data() : {}
      const b = branch?.exists() ? branch.data() as Partial<Branch> : {}
      const branchName = readString(b.name) || currentBranch?.name || ''
      const branchCode = readString(b.code) || currentBranch?.code || ''

      setShopInfo({
        nameTh:        readString(b.receiptName) || readString(c.nameTh) || branchName || 'ร้านของฉัน',
        taxId:         readString(b.receiptTaxId) || readString(c.taxId),
        phone:         readString(b.receiptPhone) || readString(b.phone) || readString(c.phone),
        email:         readString(b.receiptEmail) || readString(b.email) || readString(c.email),
        address:       readString(b.receiptAddress) || readString(b.address) || readString(c.address),
        logoUrl:       readString(c.logoUrl),
        receiptFooter: readString(b.receiptFooter) || readString(t.receiptFooter),
        branchId:      branchId || '',
        branchName,
        branchCode,
      })
      setStockPolicy({
        allowNegativeStock: Boolean(c.inventoryAllowNegativeStock),
        requireNegativeStockReason: c.inventoryNegativeStockRequiresReason !== false,
        negativeStockManagerOnly: c.inventoryNegativeStockManagerOnly !== false,
      })
      setDiscountPolicy({
        sales: Number(t.discountSales ?? DEFAULT_DISCOUNT_POLICY.sales),
        branchManager: Number(t.discountManager ?? DEFAULT_DISCOUNT_POLICY.branchManager),
        owner: Number(t.discountOwner ?? DEFAULT_DISCOUNT_POLICY.owner),
      })
    }).catch(console.error)
    return () => { active = false }
  }, [branchId, companyId, currentBranch?.code, currentBranch?.name])

  const productsForBranch = products.map(p => ({
    ...p,
    stockQty: branchStock[p.id] ?? p.stockQty ?? 0,
  }))
  const productCats = ['ทั้งหมด', ...Array.from(new Set(productsForBranch.map(p => p.category).filter(Boolean)))]
  const serviceCats = ['ทั้งหมด', ...Array.from(new Set(services.map(s => s.category).filter(Boolean)))]
  const cats  = tab === 'products' ? productCats : serviceCats

  const q = search.toLowerCase()
  const filteredProducts = productsForBranch.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)) &&
    (filterCat === 'ทั้งหมด' || p.category === filterCat) &&
    p.status !== 'deleted' && p.status !== 'archived'
  )
  const filteredServices = services.filter(s =>
    (!q || s.name.toLowerCase().includes(q)) &&
    (filterCat === 'ทั้งหมด' || s.category === filterCat) &&
    s.isActive !== false && s.status !== 'deleted'
  )
  const items = tab === 'products' ? filteredProducts : filteredServices

  const addToCart = (item: ProductWithStock | Service, type: 'product' | 'service') => {
    const price = type === 'product' ? (item as ProductWithStock).sellingPrice : (item as Service).price
    const stock = type === 'product' ? (item as ProductWithStock).stockQty ?? 999 : 999
    const allowOverStock = type === 'product' && stockPolicy.allowNegativeStock
    const existing = cart.find(c => c.id === item.id && c.type === type)
    if (existing) {
      if (!allowOverStock && existing.quantity >= stock) return
      setCart(cart.map(c => c.id === item.id && c.type === type ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      if (!allowOverStock && stock <= 0) return
      setCart([...cart, {
        id: item.id, type, name: item.name, sku: 'sku' in item ? item.sku : undefined,
        price, quantity: 1, taxType: item.taxType ?? 'vat',
        stockQty: type === 'product' ? (item as ProductWithStock).stockQty : undefined,
        costPrice: type === 'product' ? (item as ProductWithStock).costPrice : undefined,
        isWigProduct: type === 'product' ? (item as ProductWithStock).isWigProduct : undefined,
        wigType: type === 'product' ? (item as ProductWithStock).wigType : undefined,
        commissionRate: item.commissionRate, commissionAmount: item.commissionAmount,
        staffId: defaultStaffId || undefined,
        staffName: defaultStaffId ? employees.find(e => e.id === defaultStaffId)?.nickname || `${employees.find(e => e.id === defaultStaffId)?.firstName ?? ''}`.trim() : undefined,
      }])
    }
  }
  const remove    = (id: string, type: string) => setCart(cart.filter(c => !(c.id === id && c.type === type)))
  const updateQty = (id: string, type: string, qty: number) => {
    if (qty <= 0) { remove(id, type); return }
    const item = cart.find(c => c.id === id && c.type === type)
    if (item?.stockQty !== undefined && qty > item.stockQty && !(item.type === 'product' && stockPolicy.allowNegativeStock)) return
    setCart(cart.map(c => c.id === id && c.type === type ? { ...c, quantity: qty } : c))
  }

  /* ─── โหลดมัดจำค้างของลูกค้าที่เลือก (สำหรับหักมัดจำในโหมดขาย) ─── */
  useEffect(() => {
    setAppliedDepositId('')
    if (!customerId || !companyId) { setOpenDeposits([]); return }
    const q = query(
      collection(db, COLLECTIONS.DEPOSITS),
      where('companyId', '==', companyId),
      where('customerId', '==', customerId)
    )
    const unsub = onSnapshot(q, snap => {
      setOpenDeposits(
        snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) }) as Deposit)
          .filter(d => d.status === 'deposited' && (d.remainingAmount ?? 0) > 0)
      )
    }, () => setOpenDeposits([]))
    return unsub
  }, [customerId, companyId])

  const appliedDeposit  = openDeposits.find(d => d.id === appliedDepositId) || null

  /* ─── พนักงานขาย / คอมมิชชั่น ─── */
  const empLabel = (e: Employee) => e.nickname || `${e.firstName} ${e.lastName ?? ''}`.trim()
  const setStaff = (id: string, type: string, staffId: string) => {
    const emp = employees.find(e => e.id === staffId)
    setCart(cart.map(c => c.id === id && c.type === type
      ? { ...c, staffId: staffId || undefined, staffName: emp ? empLabel(emp) : undefined }
      : c))
  }
  const setItemTaxType = (id: string, type: string, taxType: 'vat' | 'non_vat') => {
    setCart(cart.map(c => c.id === id && c.type === type ? { ...c, taxType } : c))
  }
  const setCartTaxType = (taxType: 'vat' | 'non_vat') => {
    if (cart.length === 0) return
    setCart(cart.map(c => ({ ...c, taxType })))
  }
  const setItemNote = (id: string, type: string, note: string) => {
    setCart(cart.map(c => c.id === id && c.type === type ? { ...c, note } : c))
  }
  // คอมต่อรายการ: ใช้จำนวนเงินคงที่ของสินค้า > %ของสินค้า > %ของพนักงาน
  const itemCommission = (c: CartItem): number => {
    if (!c.staffId) return 0
    const lineTotal = c.price * c.quantity
    if (c.commissionAmount) return c.commissionAmount * c.quantity
    if (c.commissionRate)   return lineTotal * c.commissionRate / 100
    const emp = employees.find(e => e.id === c.staffId)
    if (emp?.commissionRate) return lineTotal * emp.commissionRate / 100
    return 0
  }
  const totalCommission = cart.reduce((s, c) => s + itemCommission(c), 0)

  /* ─── คูปอง ─── */
  const applyCoupon = async () => {
    if (!couponCode.trim() || !companyId) return
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.COUPONS),
        where('companyId', '==', companyId), where('code', '==', couponCode.trim().toUpperCase())))
      if (snap.empty) { alert('ไม่พบคูปองนี้'); return }
      const c = snap.docs[0].data()
      if (c.active === false) { alert('คูปองถูกปิดใช้งาน'); return }
      if (c.expiryDate && new Date(c.expiryDate) < new Date(new Date().toDateString())) { alert('คูปองหมดอายุแล้ว'); return }
      setDiscountType(c.discountType === 'amount' ? 'amount' : 'percent')
      setDiscount(Number(c.discountValue) || 0)
      setAppliedCoupon(c.code)
    } catch { alert('ตรวจสอบคูปองไม่สำเร็จ') }
  }
  const clearCoupon = () => { setAppliedCoupon(''); setCouponCode(''); setDiscount(0) }

  /* ─── Totals ─── */
  const subtotal    = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const rawDiscountAmt = discountType === 'percent' ? subtotal * (discount / 100) : discount
  const discountAmt = Math.min(Math.max(rawDiscountAmt, 0), subtotal)
  const taxableSubtotal = cart.reduce((s, c) => s + (c.taxType === 'vat' ? c.price * c.quantity : 0), 0)
  const taxableDiscount = subtotal > 0 ? discountAmt * (taxableSubtotal / subtotal) : 0
  const taxableAfterDisc = Math.max(taxableSubtotal - taxableDiscount, 0)
  const nonTaxableAfterDisc = Math.max((subtotal - taxableSubtotal) - (discountAmt - taxableDiscount), 0)
  const afterDisc   = taxableAfterDisc + nonTaxableAfterDisc
  const vatAmt      = showVatOnReceipt ? taxableAfterDisc - (taxableAfterDisc / (1 + VAT_RATE)) : 0
  const preVatAmount = showVatOnReceipt ? afterDisc - vatAmt : afterDisc
  const total       = afterDisc
  const lineSubtotal = (c: CartItem) => c.price * c.quantity
  const lineDiscount = (c: CartItem) => subtotal > 0 ? Math.min(lineSubtotal(c), discountAmt * (lineSubtotal(c) / subtotal)) : 0
  const lineTax = (c: CartItem) => {
    if (!showVatOnReceipt || c.taxType !== 'vat') return 0
    const taxableLineTotal = Math.max(lineSubtotal(c) - lineDiscount(c), 0)
    return taxableLineTotal - (taxableLineTotal / (1 + VAT_RATE))
  }
  const depositAmt  = Math.min(parseFloat(depositInput) || 0, total)
  const remaining   = total - depositAmt
  // หักมัดจำเดิม (เฉพาะโหมดขาย) — หักได้ไม่เกินยอดบิล
  const depositDeduct = mode === 'sale' && appliedDeposit ? Math.min(appliedDeposit.depositAmount ?? 0, total) : 0
  const netDue      = total - depositDeduct   // ยอดที่ต้องชำระจริงหลังหักมัดจำ
  const change      = mode === 'sale' ? Math.max((parseFloat(cash) || 0) - netDue, 0) : Math.max((parseFloat(cash) || 0) - depositAmt, 0)
  const payNow      = mode === 'sale' ? netDue : depositAmt
  const paymentMethodLabel = payMethods.find(p => p.id === payMethod)?.label ?? payMethod
  const cartHasWigProduct = cart.some(c => c.type === 'product' && c.isWigProduct)
  const canDiscount = hasPermission('action.sales.discount')
  const discountPercent = subtotal > 0 ? (discountAmt / subtotal) * 100 : 0
  const userDiscountLimit =
    user?.role === 'super_admin' || user?.role === 'owner'
      ? discountPolicy.owner
      : user?.role === 'branch_manager'
        ? discountPolicy.branchManager
        : user?.role === 'sales'
          ? discountPolicy.sales
          : 0
  const discountWithinRoleLimit = discountAmt <= 0 || discountPercent <= userDiscountLimit
  const discountNeedsApproval = discountAmt > 0 && !canDiscount && !discountWithinRoleLimit
  const cartVatCount = cart.filter(c => c.taxType === 'vat').length
  const cartNonVatCount = cart.length - cartVatCount
  const cartVatMode =
    cart.length === 0 ? 'empty' : cartVatCount === cart.length ? 'vat' : cartNonVatCount === cart.length ? 'non_vat' : 'mixed'
  const stockShortages: StockShortage[] = cart
    .filter(c => c.type === 'product' && typeof c.stockQty === 'number' && c.quantity > c.stockQty)
    .map(c => {
      const stockQty = c.stockQty ?? 0
      return {
        id: c.id,
        name: c.name,
        sku: c.sku,
        stockQty,
        requestedQty: c.quantity,
        shortageQty: c.quantity - stockQty,
      }
    })
  const hasNegativeStockSale = stockShortages.length > 0

  useEffect(() => {
    if (!hasNegativeStockSale) setNegativeStockReason('')
  }, [hasNegativeStockSale])

  useEffect(() => {
    if (cart.length === 0) setCheckoutOpen(false)
  }, [cart.length])

  const requestPaymentConfirm = async (action: PosMode) => {
    setPosMsg(null)
    if (action === 'sale' && cart.length === 0) return
    if (action === 'deposit' && !isDepositReady) return
    if ((action === 'deposit' || cartHasWigProduct) && !customerName.trim()) {
      setPosMsg({ type: 'err', text: 'กรุณาเลือกลูกค้าก่อนบันทึก เพื่อผูกมัดจำ/ใบสั่งผลิตกับประวัติลูกค้า' })
      return
    }
    if (slipUploading) {
      setPosMsg({ type: 'err', text: 'กรุณารออัปโหลดสลิปให้เสร็จก่อน' })
      return
    }
    if (payMethod === 'cash' && payNow > 0 && (parseFloat(cash) || 0) < payNow) {
      setPosMsg({ type: 'err', text: 'กรุณาระบุเงินสดที่รับมาให้ครบยอด' })
      return
    }
    if (action === 'sale' && hasNegativeStockSale) {
      if (!stockPolicy.allowNegativeStock) {
        setPosMsg({ type: 'err', text: 'สต๊อกไม่พอขาย กรุณารับสินค้าเข้า ปรับสต๊อก หรือเปิดอนุญาตขายติดลบในตั้งค่า' })
        return
      }
      if (stockPolicy.negativeStockManagerOnly && !await ensurePermission('action.inventory.negativeStockSale', 'ขายสินค้าสต๊อกติดลบ')) return
    }
    setPaymentVerified(payMethod === 'cash')
    setPaymentConfirm(action)
  }

  /* ─── Checkout (ขายปกติ) ─── */
  const handleCheckout = async () => {
    if (cart.length === 0 || saving) return
    // กันบันทึกยอดขายผิดบริษัท: ถ้า user ยังโหลดไม่เสร็จ companyId จะเป็น fallback
    if (!companyId || companyId === 'demo_company' || !branchId || branchId === 'demo_branch') {
      setPosMsg({ type: 'err', text: 'ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่' })
      return
    }

    const now = new Date()
    const paymentConfirmed = payMethod === 'cash' || paymentVerified
    const negativeReason = hasNegativeStockSale ? negativeStockReason.trim() : ''
    if (hasNegativeStockSale) {
      if (!stockPolicy.allowNegativeStock) {
        setPosMsg({ type: 'err', text: 'สต๊อกไม่พอขาย กรุณารับสินค้าเข้า ปรับสต๊อก หรือเปิดอนุญาตขายติดลบในตั้งค่า' })
        return
      }
      if (stockPolicy.requireNegativeStockReason && !negativeReason) {
        setPosMsg({ type: 'err', text: 'กรุณาระบุเหตุผลการขายสต๊อกติดลบก่อนบันทึก' })
        return
      }
      if (stockPolicy.negativeStockManagerOnly && !await ensurePermission('action.inventory.negativeStockSale', 'ขายสินค้าสต๊อกติดลบ')) return
    }
    if (discountNeedsApproval && !await ensurePermission('action.sales.discount', `ให้ส่วนลดเกิน ${userDiscountLimit}%`)) return
    if (paymentConfirmed && !await ensurePermission('action.sales.confirmPayment', 'ยืนยันการชำระเงิน')) return
    setSaving(true)
    setPosMsg({ type: 'ok', text: 'กำลังบันทึกการขาย...' })
    let receiptNo: string
    try {
      receiptNo = await generateBranchDocumentNo(companyId, branchId, 'receipt')
    } catch (err) {
      setPosMsg({ type: 'err', text: 'สร้างเลขที่ใบเสร็จไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง') })
      setSaving(false)
      return
    }
    const paymentRecord = {
      method: payMethod,
      amount: netDue,
      ...(slipUrl ? { slipUrl } : {}),
      ...(paymentConfirmed ? { approvedBy: userId, approvedAt: now } : {}),
    }
    const receiptInfo: ReceiptShopSnapshot = {
      ...shopInfo,
      branchId,
      branchName: shopInfo.branchName || currentBranch?.name || '',
      branchCode: shopInfo.branchCode || currentBranch?.code || '',
    }

    const saleData: Record<string, unknown> = {
      companyId, branchId, receiptNo,
      branchName: receiptInfo.branchName ?? '',
      branchCode: receiptInfo.branchCode ?? '',
      receiptInfo,
      items: cart.map(c => {
        const stockBefore = c.type === 'product' && typeof c.stockQty === 'number' ? c.stockQty : null
        const stockAfter = stockBefore === null ? null : stockBefore - c.quantity
        const isNegativeStockSale = stockAfter !== null && stockAfter < 0
        const itemNote = c.note?.trim()
        return {
          type: c.type, productId: c.type === 'product' ? c.id : null, name: c.name, sku: c.sku ?? null,
          isWigProduct: c.isWigProduct ?? false, wigType: c.wigType ?? null,
          quantity: c.quantity, unitPrice: c.price, discountAmount: lineDiscount(c), taxType: c.taxType,
          taxAmount: lineTax(c), taxIncluded: true, total: lineSubtotal(c),
          note: itemNote || null,
          staffId: c.staffId ?? null, staffName: c.staffName ?? null, commissionAmount: itemCommission(c),
          stockBefore, stockAfter,
          isNegativeStockSale,
          negativeStockQty: isNegativeStockSale ? Math.abs(stockAfter ?? 0) : 0,
          negativeStockReason: isNegativeStockSale ? negativeReason : null,
          negativeStockApprovedBy: isNegativeStockSale ? userId : null,
        }
      }),
      subtotal, discountAmount: discountAmt, discountPercent: discountType === 'percent' ? discount : 0,
      preVatAmount,
      taxAmount: vatAmt, totalAmount: total,
      taxIncluded: true, showVatOnReceipt,
      payments: [paymentRecord],
      paidAmount: payMethod === 'cash' ? (parseFloat(cash) || netDue) : netDue,
      changeAmount: change,
      status: paymentConfirmed ? 'completed' : 'pending',
      paymentStatus: paymentConfirmed ? 'confirmed' : 'pending',
      createdBy: userId,
      createdByName: cashierName,
      receivedBy: userId,
      receivedByName: cashierName,
    }
    if (paymentConfirmed) {
      saleData.paymentConfirmedBy = userId
      saleData.paymentConfirmedByName = cashierName
      saleData.paymentConfirmedAt = now
    }
    if (customerId)     saleData.customerId     = customerId
    if (customerName)   saleData.customerName   = customerName
    if (depositDeduct > 0) saleData.depositDeducted = depositDeduct
    if (hasNegativeStockSale) {
      saleData.hasNegativeStockSale = true
      saleData.negativeStockReason = negativeReason
      saleData.negativeStockApprovedBy = userId
      saleData.negativeStockApprovedAt = now
      saleData.negativeStockItems = stockShortages
    }

    // รอผลบันทึกจริงก่อนออกใบเสร็จ — ถ้าพลาดจะได้แจ้ง ไม่ใช่ยอดขายหายเงียบ
    let saleId: string
    try {
      saleId = await addDocument<Sale>(COLLECTIONS.SALES, saleData as Omit<Sale, 'id'>)
    } catch (err) {
      console.error('Sale save error:', err)
      setPosMsg({ type: 'err', text: 'บันทึกการขายไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง') })
      setSaving(false)
      return
    }

    let createdWorkOrderCount = 0
    const wigItems = cart.filter(c => c.type === 'product' && c.isWigProduct)
    if (wigItems.length > 0) {
      setPosMsg({ type: 'ok', text: 'กำลังสร้างใบสั่งผลิตจากบิลขาย...' })
      for (const item of wigItems) {
        try {
          const orderNo = await generateWigOrderNo(companyId, branchId)
          const lineTotal = item.price * item.quantity
          const woData: Record<string, unknown> = {
            companyId,
            branchId,
            orderNo,
            branchName: receiptInfo.branchName ?? '',
            branchCode: receiptInfo.branchCode ?? '',
            receiptInfo,
            customerId: customerId || '',
            customerName: customerName.trim() || 'ลูกค้าไม่ระบุชื่อ',
            saleOrderId: saleId,
            saleReceiptNo: receiptNo,
            sourceType: 'sale',
            sourceNo: receiptNo,
            sourceItemId: item.id,
            sourceItemName: item.name,
            sourceItemQty: item.quantity,
            totalAmount: lineTotal,
            depositAmount: lineTotal,
            remainingAmount: 0,
            status: 'waiting',
            progressImages: [],
            completedImages: [],
            performedBy: userId,
            orderDate: now,
            depositDate: now,
            notes: `สร้างจากบิลขาย ${receiptNo}${item.quantity > 1 ? ` · จำนวน ${item.quantity}` : ''}`,
          }
          const itemWigType = wigSpec.wigType || item.wigType
          if (itemWigType) woData.wigType = itemWigType
          if (wigSpec.wigColor) woData.wigColor = wigSpec.wigColor
          if (wigSpec.wigLength) woData.wigLength = wigSpec.wigLength
          if (wigSpec.wigModel) woData.wigModel = wigSpec.wigModel
          if (wigSpec.manufacturer) woData.manufacturer = wigSpec.manufacturer
          await addDocument<WorkOrder>(COLLECTIONS.WORK_ORDERS, woData as Omit<WorkOrder, 'id'>)
          createdWorkOrderCount += 1
        } catch (err) {
          console.error('WorkOrder from sale error:', err)
        }
      }
    }

    // ตัดสต๊อกสินค้า (เฉพาะ product) + บันทึกการเคลื่อนไหว 'out' (best-effort — ขายบันทึกแล้ว)
    cart.filter(c => c.type === 'product').forEach(c => {
      const previousQty = typeof c.stockQty === 'number' ? c.stockQty : 0
      const newQty = previousQty - c.quantity
      const isNegativeStock = newQty < 0
      adjustBranchStock({
        companyId,
        branchId,
        productId: c.id,
        productName: c.name,
        delta: -c.quantity,
        type: 'out',
        costPrice: c.costPrice ?? 0,
        referenceType: 'sale',
        referenceNo: receiptNo,
        performedBy: userId,
        notes: isNegativeStock
          ? `ขายบิล ${receiptNo} · สต๊อกติดลบจาก ${previousQty} เป็น ${newQty}${negativeReason ? ` · เหตุผล: ${negativeReason}` : ''}`
          : `ขายบิล ${receiptNo} · สต๊อกสาขาจาก ${previousQty} เป็น ${newQty}`,
      }).catch(err => console.error('Branch stock decrement error:', err))
    })

    // เขียน commission_records ต่อรายการที่ระบุพนักงานขาย (best-effort — ขายบันทึกแล้ว)
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    cart.filter(c => c.staffId && itemCommission(c) > 0).forEach(c => {
      addDocument(COLLECTIONS.COMMISSION_RECORDS, {
        companyId, branchId, employeeId: c.staffId!, saleId,
        type: c.type, itemName: c.name, saleAmount: c.price * c.quantity,
        commissionRate: c.commissionRate ?? null,
        commissionAmount: itemCommission(c),
        status: 'pending', month: monthKey,
      } as never).catch(err => console.error('Commission record error:', err))
    })

    // ปิดมัดจำที่ถูกหัก (best-effort — ขายบันทึกแล้ว)
    if (appliedDeposit && depositDeduct > 0) {
      updateDoc(doc(db, COLLECTIONS.DEPOSITS, appliedDeposit.id), {
        status: 'paid_full', remainingAmount: 0,
        paidAmount: (appliedDeposit.totalAmount ?? appliedDeposit.depositAmount ?? 0),
        closedBySaleId: saleId, updatedAt: serverTimestamp(),
      }).catch(err => console.error('Close deposit error:', err))
    }

    // Show receipt after confirmed save
    setReceipt({ mode: 'sale', receiptNo, customerName: customerName || '', items: [...cart], subtotal, discountAmt, preVatAmount, vatAmt, total, showVatOnReceipt, taxIncluded: true, depositAmt: depositDeduct, remaining: netDue, pickupDate: '', depositNote: '', payMethod, paidAmount: payMethod === 'cash' ? (parseFloat(cash) || netDue) : netDue, change, date: new Date(), branchName: receiptInfo.branchName, branchCode: receiptInfo.branchCode, shopInfo: receiptInfo, saleId, customerId: customerId || undefined, workOrderCreatedCount: createdWorkOrderCount, receiverName: cashierName })
    setCart([]); setCash(''); setDiscount(0); setCustomerName(''); setCustomerId('')
    setWigSpec({ wigType: '', wigColor: '', wigLength: '', wigModel: '', manufacturer: '' })
    setSlipUrl(''); setAppliedDepositId(''); setCouponCode(''); setAppliedCoupon('')
    setShowVatOnReceipt(false)
    setNegativeStockReason('')
    setPaymentConfirm(null); setPaymentVerified(false)
    setPosMsg({ type: 'ok', text: `บันทึกการขายสำเร็จ เลขที่ ${receiptNo}${createdWorkOrderCount > 0 ? ` · สร้างใบสั่งผลิต ${createdWorkOrderCount} รายการ` : ''}` })
    setSaving(false)
  }

  /* ─── รับมัดจำ ─── */
  const handleDeposit = async () => {
    if (cart.length === 0 || depositAmt <= 0 || saving) return
    if (!companyId || companyId === 'demo_company' || !branchId || branchId === 'demo_branch') {
      setPosMsg({ type: 'err', text: 'ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่' })
      return
    }

    const now = new Date()
    const paymentConfirmed = payMethod === 'cash' || paymentVerified
    if (discountNeedsApproval && !await ensurePermission('action.sales.discount', `ให้ส่วนลดเกิน ${userDiscountLimit}%`)) return
    if (paymentConfirmed && !await ensurePermission('action.sales.confirmPayment', 'ยืนยันการชำระเงิน')) return
    setSaving(true)
    setPosMsg({ type: 'ok', text: 'กำลังบันทึกมัดจำ...' })
    let depositNo: string
    try {
      depositNo = await generateBranchDocumentNo(companyId, branchId, 'deposit')
    } catch (err) {
      setPosMsg({ type: 'err', text: 'สร้างเลขที่มัดจำไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง') })
      setSaving(false)
      return
    }
    const saleOrderId = depositNo

    const notesStr = [depositNote, pickupDate ? `นัดรับ: ${pickupDate}` : ''].filter(Boolean).join(' | ')
    const custName = customerName || 'ลูกค้าทั่วไป'
    const custId   = customerId   || ''
    const receiptInfo: ReceiptShopSnapshot = {
      ...shopInfo,
      branchId,
      branchName: shopInfo.branchName || currentBranch?.name || '',
      branchCode: shopInfo.branchCode || currentBranch?.code || '',
    }

    // Fire-and-forget — ไม่รอ
    const depData: Record<string, unknown> = {
      companyId, branchId, depositNo,
      branchName: receiptInfo.branchName ?? '',
      branchCode: receiptInfo.branchCode ?? '',
      receiptInfo,
      customerId: custId, customerName: custName,
      items: cart.map(c => ({ productId: c.type === 'product' ? c.id : undefined, serviceId: c.type === 'service' ? c.id : undefined, name: c.name, isWigProduct: c.isWigProduct ?? false, wigType: c.wigType, quantity: c.quantity, unitPrice: c.price, discountAmount: lineDiscount(c), taxType: c.taxType, taxAmount: lineTax(c), taxIncluded: true, total: lineSubtotal(c), note: c.note?.trim() || undefined })),
      preVatAmount,
      taxAmount: vatAmt,
      taxIncluded: true,
      showVatOnReceipt,
      totalAmount: total, depositAmount: depositAmt, paidAmount: depositAmt,
      remainingAmount: remaining, status: remaining <= 0 ? 'paid_full' : 'deposited',
      paymentMethod: payMethod,
      paymentStatus: paymentConfirmed ? 'confirmed' : 'pending',
      createdBy: userId,
      createdByName: cashierName,
      receivedBy: userId,
      receivedByName: cashierName,
    }
    if (paymentConfirmed) {
      depData.paymentConfirmedBy = userId
      depData.paymentConfirmedByName = cashierName
      depData.paymentConfirmedAt = now
    }
    if (notesStr) depData.notes = notesStr
    if (slipUrl)  depData.slipUrl = slipUrl
    // รอผลบันทึกมัดจำจริง (ยอดเงิน) ก่อนออกใบ
    let depositId: string
    try {
      depositId = await addDocument<Deposit>(COLLECTIONS.DEPOSITS, depData as Omit<Deposit, 'id'>)
    } catch (err) {
      console.error('Deposit save error:', err)
      setPosMsg({ type: 'err', text: 'บันทึกมัดจำไม่สำเร็จ: ' + (err instanceof Error ? err.message : 'ลองใหม่อีกครั้ง') })
      setSaving(false)
      return
    }

    let createdDepositWorkOrder = false
    if (createWorkOrder) {
      setPosMsg({ type: 'ok', text: 'กำลังสร้างใบสั่งผลิตจากมัดจำ...' })
      try {
        const orderNo = await generateWigOrderNo(companyId, branchId)
        const woData: Record<string, unknown> = {
          companyId, branchId, orderNo,
          branchName: receiptInfo.branchName ?? '',
          branchCode: receiptInfo.branchCode ?? '',
          receiptInfo,
          customerId: custId, customerName: custName,
          saleOrderId, sourceType: 'deposit', sourceNo: depositNo,
          totalAmount: total, depositAmount: depositAmt,
          remainingAmount: remaining, status: 'waiting',
          progressImages: [], completedImages: [], performedBy: userId,
          orderDate: now,
        }
        if (wigSpec.wigType)      woData.wigType      = wigSpec.wigType
        if (wigSpec.wigColor)     woData.wigColor     = wigSpec.wigColor
        if (wigSpec.wigLength)    woData.wigLength    = wigSpec.wigLength
        if (wigSpec.wigModel)     woData.wigModel     = wigSpec.wigModel
        if (wigSpec.manufacturer) woData.manufacturer = wigSpec.manufacturer
        if (depositNote)          woData.notes        = depositNote
        if (pickupDate)           woData.expectedDate = new Date(pickupDate)
        await addDocument<WorkOrder>(COLLECTIONS.WORK_ORDERS, woData as Omit<WorkOrder, 'id'>)
        createdDepositWorkOrder = true
      } catch (err) {
        console.error('WorkOrder save error:', err)
        setPosMsg({ type: 'err', text: 'บันทึกมัดจำแล้ว แต่สร้างใบสั่งผลิตไม่สำเร็จ กรุณาไปสร้างในหน้างานผลิตวิก' })
      }
    }

    // Show receipt immediately — ไม่ต้องรอ
    setReceipt({ mode: 'deposit', receiptNo: depositNo, customerName: custName, items: [...cart], subtotal, discountAmt, preVatAmount, vatAmt, total, showVatOnReceipt, taxIncluded: true, depositAmt, remaining, pickupDate, depositNote, payMethod, paidAmount: payMethod === 'cash' ? (parseFloat(cash) || depositAmt) : depositAmt, change, date: now, branchName: receiptInfo.branchName, branchCode: receiptInfo.branchCode, shopInfo: receiptInfo, depositId, customerId: custId || undefined, workOrderCreatedCount: createdDepositWorkOrder ? 1 : 0, receiverName: cashierName })
    setCart([]); setCash(''); setDiscount(0); setCustomerName(''); setCustomerId(''); setDepositInput(''); setPickupDate(''); setDepositNote('')
    setWigSpec({ wigType: '', wigColor: '', wigLength: '', wigModel: '', manufacturer: '' })
    setSlipUrl(''); setCouponCode(''); setAppliedCoupon('')
    setShowVatOnReceipt(false)
    setPaymentConfirm(null); setPaymentVerified(false)
    if (createdDepositWorkOrder || !createWorkOrder) {
      setPosMsg({ type: 'ok', text: `บันทึกมัดจำสำเร็จ เลขที่ ${depositNo}${createdDepositWorkOrder ? ' · สร้างใบสั่งผลิตแล้ว' : ''}` })
    }
    setSaving(false)
  }

  /* ─── อัปโหลดสลิป ─── */
  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setPosMsg({ type: 'err', text: 'ไฟล์ใหญ่เกิน 5MB' })
      return
    }
    setSlipUploading(true)
    setPosMsg({ type: 'ok', text: 'กำลังอัปโหลดสลิป...' })
    try {
      setSlipUrl(await uploadToCloudinary(file, 'wigpro/slips'))
      setPosMsg({ type: 'ok', text: 'แนบสลิปสำเร็จ' })
    } catch {
      setPosMsg({ type: 'err', text: 'อัปโหลดสลิปไม่สำเร็จ' })
    } finally { setSlipUploading(false) }
  }

  const isDepositReady = mode === 'deposit' && depositAmt > 0 && depositAmt <= total

  return (
    <>
    <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-8.5rem)] lg:min-h-[36rem]">

      {/* ── LEFT: Product/Service browser ── */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-light)] space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า/บริการ..."
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['products', 'services'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setFilterCat('ทั้งหมด') }}
                className={`flex min-w-0 items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm shadow-pink-200' : 'bg-[var(--bg-base)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {t === 'products' ? <Package className="w-4 h-4" /> : <Scissors className="w-4 h-4" />}
                <span className="truncate">{t === 'products' ? `สินค้า (${products.filter(p => p.status !== 'deleted').length})` : `บริการ (${services.filter(s => s.status !== 'deleted').length})`}</span>
              </button>
            ))}
          </div>
          {cats.length > 1 && (
            <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-3 sm:max-w-md">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="text-[11px] font-bold text-[var(--text-muted)]">
                  {tab === 'products' ? 'เลือกประเภทสินค้า' : 'เลือกประเภทบริการ'}
                </label>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--pink-600)]">
                  {items.length} รายการ
                </span>
              </div>
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                className="w-full cursor-pointer rounded-xl border border-[var(--border-light)] bg-white px-3 py-3 text-sm font-bold text-[var(--text-primary)] outline-none transition focus:border-[var(--pink-300)] focus:ring-2 focus:ring-[var(--pink-100)]"
              >
                {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">กดเพื่อเลือกหมวด แล้วรายการด้านล่างจะกรองให้ทันที</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {dataLoading ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" /></div>
          ) : items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-base)] flex items-center justify-center">
                <Package className="w-6 h-6 text-[var(--text-light)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">{tab === 'products' ? 'ยังไม่มีสินค้า' : 'ยังไม่มีบริการ'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {items.map(item => {
                const stock = tab === 'products' ? ((item as ProductWithStock).stockQty ?? 0) : null
                const outOfStock = stock !== null && stock <= 0
                const blockedByStock = outOfStock && !(tab === 'products' && stockPolicy.allowNegativeStock)
                const inCart = cart.find(c => c.id === item.id && c.type === (tab === 'products' ? 'product' : 'service'))
                return (
                  <button key={item.id}
                    onClick={() => !blockedByStock && addToCart(item as ProductWithStock | Service, tab === 'products' ? 'product' : 'service')}
                    disabled={blockedByStock}
                    className={`relative text-left p-3.5 rounded-2xl border transition-all group active:scale-[0.97] ${blockedByStock ? 'border-[var(--border-light)] opacity-50 cursor-not-allowed' : inCart ? 'border-[var(--pink-300)] bg-[var(--pink-50)]/70 shadow-md shadow-pink-100' : outOfStock ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50 shadow-sm' : 'border-[var(--border-light)] hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)]/50 hover:shadow-md hover:shadow-pink-100'}`}>
                    <div className={`aspect-square rounded-xl mb-3 flex items-center justify-center transition-colors ${inCart ? 'bg-[var(--pink-100)]' : 'bg-gradient-to-br from-[var(--pink-50)] to-purple-50'}`}>
                      {tab === 'products' ? <Package className="w-7 h-7 text-[var(--pink-300)]" /> : <Scissors className="w-7 h-7 text-[var(--pink-300)]" />}
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-snug">{item.name}</p>
                    {'sku' in item && item.sku && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.sku}</p>}
                    <p className="text-sm font-bold text-[var(--pink-500)] mt-1.5">{formatCurrency('sellingPrice' in item ? item.sellingPrice : item.price)}</p>
                    {tab === 'products' && stock !== null && (
                      <div className={`flex items-center gap-1 mt-1 text-[9px] font-semibold ${outOfStock ? 'text-red-500' : stock <= ((item as ProductWithStock).minStockAlert ?? 5) ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {outOfStock ? <><AlertTriangle className="w-2.5 h-2.5" />{stockPolicy.allowNegativeStock ? 'หมด · ขายติดลบได้' : 'หมด'}</> : stock <= ((item as ProductWithStock).minStockAlert ?? 5) ? <><AlertTriangle className="w-2.5 h-2.5" />เหลือ {stock}</> : <>คงเหลือ {stock}</>}
                      </div>
                    )}
                    {inCart && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-br from-[#f472b6] to-[#e879a0] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                        {inCart.quantity}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart ── */}
      <div id="pos-cart-panel" className="w-full lg:w-[460px] xl:w-[500px] flex flex-col bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">

        {/* Cart header */}
        <div className="p-4 border-b border-[var(--border-light)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[var(--pink-400)]" /> ตะกร้า
              {cart.length > 0 && (
                <span className="rounded-full bg-gradient-to-r from-[#f472b6] to-[#e879a0] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                  {cart.length} รายการ · {cart.reduce((s, c) => s + c.quantity, 0)} ชิ้น
                </span>
              )}
            </h2>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-500 font-medium">ล้างทั้งหมด</button>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1.5 p-1 bg-[var(--bg-base)] rounded-xl border border-[var(--border-light)]">
            <button onClick={() => setMode('sale')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'sale' ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:bg-white'}`}>
              <ShoppingCart className="w-3.5 h-3.5" /> ขายปกติ
            </button>
            <button onClick={() => setMode('deposit')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'deposit' ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm' : 'text-[var(--text-secondary)] hover:bg-white'}`}>
              <Wallet className="w-3.5 h-3.5" /> วางมัดจำ
            </button>
          </div>

          {cart.length > 0 && (
            <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-base)] p-2 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border border-[var(--border-light)]">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)]">การแสดง VAT บนใบเสร็จ</p>
                  <p className="text-[10px] text-[var(--text-muted)]">ราคาสินค้า/บริการเป็นราคารวม VAT แล้ว ระบบไม่บวกเพิ่ม</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVatOnReceipt(v => !v)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
                    showVatOnReceipt
                      ? 'border-blue-200 bg-blue-50 text-blue-600'
                      : 'border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
                  }`}
                >
                  {showVatOnReceipt ? 'แสดง VAT' : 'ไม่แสดง VAT'}
                </button>
              </div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">รายการที่นับเป็น VAT</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  cartVatMode === 'vat'
                    ? 'bg-blue-50 text-blue-600'
                    : cartVatMode === 'non_vat'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-purple-50 text-purple-600'
                }`}>
                  {cartVatMode === 'vat' ? 'นับ VAT ทั้งหมด' : cartVatMode === 'non_vat' ? 'ไม่นับ VAT ทั้งหมด' : 'VAT ผสม'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setCartTaxType('vat')}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${cartVatMode === 'vat' ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-blue-50'}`}
                >
                  นับ VAT ทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setCartTaxType('non_vat')}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${cartVatMode === 'non_vat' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-amber-50'}`}
                >
                  ไม่นับ VAT ทั้งหมด
                </button>
              </div>
            </div>
          )}

          {/* Customer search */}
          <CustomerSearchInput
            companyId={companyId}
            selectedId={customerId}
            selectedName={customerName}
            onSelect={(id, name) => { setCustomerId(id); setCustomerName(name) }}
            onClear={() => { setCustomerId(''); setCustomerName('') }}
            placeholder={mode === 'deposit' ? 'ค้นหาลูกค้า (แนะนำสำหรับมัดจำ)' : 'ค้นหาลูกค้า (ไม่บังคับ)'}
          />
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex items-center justify-center flex-col gap-3 py-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--pink-50)] to-purple-50 flex items-center justify-center">
                <ShoppingCart className="w-7 h-7 text-[var(--pink-200)]" />
              </div>
              <p className="text-sm text-[var(--text-muted)]">ยังไม่มีสินค้าในตะกร้า</p>
              <p className="text-xs text-[var(--text-light)]">เลือกสินค้าหรือบริการด้านซ้าย</p>
            </div>
          ) : cart.map(item => {
            const itemKey = `${item.id}-${item.type}`
            const isItemDetailOpen = expandedCartItemId === itemKey
            const commission = itemCommission(item)
            const hasItemConfig = item.taxType === 'non_vat' || Boolean(item.staffId)
            return (
            <div key={itemKey} className="rounded-2xl bg-white border border-[var(--border-light)] p-3 shadow-sm shadow-pink-50">
              <div className="flex gap-3">
                <div className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-[var(--pink-50)] flex items-center justify-center">
                  {item.type === 'product'
                    ? <Package className="h-4 w-4 text-[var(--pink-400)]" />
                    : <Scissors className="h-4 w-4 text-[var(--pink-400)]" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid min-w-0 flex-1 grid-cols-[minmax(86px,0.8fr)_minmax(120px,1fr)] items-center gap-2">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)] leading-snug">{item.name}</p>
                      <input
                        value={item.note ?? ''}
                        onChange={e => setItemNote(item.id, item.type, e.target.value)}
                        maxLength={180}
                        placeholder="หมายเหตุ..."
                        aria-label={`หมายเหตุ ${item.name}`}
                        className="h-8 min-w-0 rounded-lg border border-[var(--border-light)] bg-[var(--bg-base)] px-2 text-xs text-[var(--text-primary)] outline-none transition focus:border-[var(--pink-300)] focus:bg-white focus:ring-2 focus:ring-[var(--pink-100)]"
                      />
                    </div>
                    <button onClick={() => remove(item.id, item.type)} className="h-8 w-8 shrink-0 rounded-xl border border-[var(--border-light)] flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-colors" aria-label={`ลบ ${item.name}`}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    {item.sku && <span className="max-w-full truncate rounded-full bg-[var(--bg-base)] px-2 py-0.5">{item.sku}</span>}
                    <span className="rounded-full bg-[var(--bg-base)] px-2 py-0.5">ชิ้นละ {formatCurrency(item.price)}</span>
                    {showVatOnReceipt && (
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${item.taxType === 'vat' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-700'}`}>
                        {item.taxType === 'vat' ? 'รวม VAT' : 'ไม่นับ VAT'}
                      </span>
                    )}
                    {item.staffName && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">ผู้ขาย {item.staffName}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-full bg-[var(--bg-base)] border border-[var(--border-light)] p-1">
                  <button onClick={() => updateQty(item.id, item.type, item.quantity - 1)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white hover:bg-[var(--pink-50)] transition-all text-[var(--pink-500)] shadow-sm"><Minus className="w-3.5 h-3.5" /></button>
                  <span className="w-8 text-center text-base font-bold text-[var(--text-primary)]">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, item.type, item.quantity + 1)} className="w-8 h-8 rounded-full flex items-center justify-center bg-white hover:bg-[var(--pink-50)] transition-all text-[var(--pink-500)] shadow-sm"><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <p className="text-right text-base font-bold text-[var(--pink-500)]">{formatCurrency(item.price * item.quantity)}</p>
                  <button
                    type="button"
                    onClick={() => setExpandedCartItemId(isItemDetailOpen ? '' : itemKey)}
                    title="ตั้งค่า VAT / ผู้ขาย"
                    className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all ${hasItemConfig ? 'border-[var(--pink-200)] bg-[var(--pink-50)] text-[var(--pink-600)]' : 'border-[var(--border-light)] bg-white text-[var(--text-muted)] hover:bg-[var(--pink-50)] hover:text-[var(--pink-500)]'}`}
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {item.type === 'product' && typeof item.stockQty === 'number' && item.quantity > item.stockQty && (
                <div className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>ขายเกินสต๊อก {item.quantity - item.stockQty} ชิ้น · หลังขายจะเหลือ {item.stockQty - item.quantity}</span>
                </div>
              )}
              {isItemDetailOpen && (
                <div className="mt-3 space-y-2 rounded-xl border border-[var(--border-light)] bg-[var(--bg-base)] p-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => setItemTaxType(item.id, item.type, 'vat')}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${item.taxType === 'vat' ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-blue-50'}`}>
                      นับ VAT
                    </button>
                    <button type="button" onClick={() => setItemTaxType(item.id, item.type, 'non_vat')}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-all ${item.taxType === 'non_vat' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:bg-amber-50'}`}>
                      ไม่นับ VAT
                    </button>
                  </div>
                  {employees.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)] shrink-0">ผู้ขาย</span>
                      <select value={item.staffId ?? ''} onChange={e => setStaff(item.id, item.type, e.target.value)}
                        className="flex-1 px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]">
                        <option value="">— ไม่ระบุ —</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{empLabel(e)}</option>)}
                      </select>
                      {commission > 0 && (
                        <span className="text-xs font-semibold text-emerald-600 shrink-0">คอม {formatCurrency(commission)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>

        {/* Compact summary + checkout entry */}
        <div className="shrink-0 p-4 border-t border-[var(--border-light)] space-y-3 bg-white shadow-[0_-8px_24px_rgba(244,114,182,0.08)]">
          <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-3 space-y-2">
            <div className="flex justify-between text-sm text-[var(--text-secondary)]">
              <span>ก่อนส่วนลด</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-sm font-semibold text-emerald-600">
                <span>ส่วนลด/คูปอง</span><span>-{formatCurrency(discountAmt)}</span>
              </div>
            )}
            {showVatOnReceipt && (
              <>
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>มูลค่าก่อน VAT</span><span>{formatCurrency(preVatAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>VAT 7% (รวมอยู่ในราคา)</span><span>{formatCurrency(vatAmt)}</span>
                </div>
              </>
            )}
            {depositDeduct > 0 && (
              <div className="flex justify-between text-sm font-semibold text-amber-600">
                <span>หักมัดจำเดิม</span><span>-{formatCurrency(depositDeduct)}</span>
              </div>
            )}
            {mode === 'deposit' && depositAmt > 0 && (
              <div className="flex justify-between text-sm font-semibold text-amber-600">
                <span>รับมัดจำ</span><span>{formatCurrency(depositAmt)}</span>
              </div>
            )}
            <div className="flex items-end justify-between gap-3 border-t border-[var(--border-light)] pt-2">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{mode === 'sale' ? 'ยอดที่ต้องชำระ' : 'ยอดรวมรายการ'}</p>
                <p className="text-[11px] text-[var(--text-light)]">กดปุ่มด้านล่างเพื่อเลือกวิธีชำระและบันทึก</p>
              </div>
              <p className="text-xl font-black text-[var(--pink-600)] whitespace-nowrap">
                {formatCurrency(mode === 'sale' ? payNow : total)}
              </p>
            </div>
          </div>
          {mode === 'sale' && hasNegativeStockSale && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              บิลนี้มีขายสต๊อกติดลบ ระบบจะให้ยืนยันเหตุผลก่อนบันทึก
            </div>
          )}
          {posMsg && (
            <div className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
              posMsg.type === 'ok'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}>
              {posMsg.text}
            </div>
          )}
          <button
            type="button"
            onClick={() => { setPosMsg(null); if (cart.length > 0) setCheckoutOpen(true) }}
            disabled={cart.length === 0 || saving}
            className={`w-full py-4 text-white font-black rounded-2xl shadow-lg active:scale-[0.98] transition-all disabled:opacity-40 text-base flex items-center justify-center gap-2 ${
              mode === 'sale'
                ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] shadow-pink-200'
                : 'bg-gradient-to-r from-amber-400 to-orange-400 shadow-amber-200'
            }`}
          >
            {saving ? (
              <><Loader2 className="w-5 h-5 animate-spin" />กำลังบันทึก...</>
            ) : mode === 'sale' ? (
              <>ไปชำระเงิน / บันทึกขาย · {formatCurrency(payNow)}</>
            ) : (
              <>ไปบันทึกมัดจำ · {depositAmt > 0 ? formatCurrency(depositAmt) : 'กรอกยอดถัดไป'}</>
            )}
          </button>
        </div>

        {checkoutOpen && (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-sm">
            <button
              type="button"
              aria-label="ปิดขั้นชำระเงิน"
              className="absolute inset-0 cursor-default"
              onClick={() => !saving && setCheckoutOpen(false)}
            />
            <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
              <div className="shrink-0 border-b border-[var(--border-light)] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-[var(--text-primary)]">
                      {mode === 'sale' ? 'ชำระเงินและบันทึกขาย' : 'บันทึกมัดจำ'}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {cart.length} รายการ · {cart.reduce((s, c) => s + c.quantity, 0)} ชิ้น · ยอดรวม {formatCurrency(total)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !saving && setCheckoutOpen(false)}
                    disabled={saving}
                    className="h-9 w-9 rounded-xl border border-[var(--border-light)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-base)] disabled:opacity-50"
                    aria-label="ปิด"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-[var(--bg-base)] p-4 space-y-3">

          {/* พนักงานขายเริ่มต้น — ใส่ให้ทุกรายการที่หยิบใหม่ */}
          {employees.length > 0 && (
            <select value={defaultStaffId} onChange={e => setDefaultStaffId(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]">
              <option value="">เลือกพนักงานขายเริ่มต้น (ไม่บังคับ)</option>
              {employees.map(e => <option key={e.id} value={e.id}>{empLabel(e)}</option>)}
            </select>
          )}

          {/* คูปอง */}
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            {appliedCoupon ? (
              <div className="flex-1 flex items-center justify-between px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-xs font-semibold text-emerald-700">✓ ใช้คูปอง {appliedCoupon}</span>
                <button onClick={clearCoupon} className="text-xs text-red-500">ยกเลิก</button>
              </div>
            ) : (
              <>
                <input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="รหัสคูปอง"
                  className="flex-1 px-3 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)]" />
                <button onClick={applyCoupon} className="px-3 py-1.5 bg-[var(--pink-100)] text-[var(--pink-600)] rounded-lg text-xs font-semibold shrink-0">ใช้</button>
              </>
            )}
          </div>

          {/* Discount */}
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input type="number" value={discount || ''} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} placeholder="ส่วนลด" title={canDiscount ? 'ใส่ส่วนลด' : 'ถ้าใช้ส่วนลด ระบบจะส่งคำขอสิทธิ์ให้เจ้าของร้าน'}
              className="flex-1 px-3 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            <select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'amount')}
              className="px-2 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-xs focus:outline-none">
              <option value="percent">%</option>
              <option value="amount">฿</option>
            </select>
          </div>
          {discountAmt > 0 && !canDiscount && (
            <p className={`-mt-1 text-[11px] font-semibold ${discountNeedsApproval ? 'text-amber-600' : 'text-emerald-600'}`}>
              {discountNeedsApproval
                ? `ส่วนลดนี้คิดเป็น ${discountPercent.toFixed(1)}% เกินสิทธิ์บัญชีนี้ (${userDiscountLimit}%) ต้องขอเจ้าของร้านอนุมัติ`
                : `ส่วนลดนี้อยู่ในสิทธิ์บัญชีนี้ (${discountPercent.toFixed(1)}% / ${userDiscountLimit}%)`}
            </p>
          )}

          {/* Totals */}
          <div className="bg-white rounded-xl border border-[var(--border-light)] p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>ก่อนส่วนลด</span><span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-emerald-500 font-medium">
                <span>ส่วนลด</span><span>-{formatCurrency(discountAmt)}</span>
              </div>
            )}
            {showVatOnReceipt && (
              <>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>มูลค่าก่อน VAT</span><span>{formatCurrency(preVatAmount)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>VAT 7% (รวมอยู่ในราคา)</span><span>{formatCurrency(vatAmt)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-[var(--border-light)]">
              <span className="text-[var(--text-primary)]">ยอดรวม</span>
              <span className="text-[var(--pink-500)]">{formatCurrency(total)}</span>
            </div>
            {depositDeduct > 0 && (
              <>
                <div className="flex justify-between text-amber-600 text-xs"><span>หักมัดจำเดิม</span><span>-{formatCurrency(depositDeduct)}</span></div>
                <div className="flex justify-between font-bold text-sm text-[var(--pink-600)] pt-0.5"><span>ยอดชำระสุทธิ</span><span>{formatCurrency(netDue)}</span></div>
              </>
            )}
            {totalCommission > 0 && (
              <div className="flex justify-between text-[11px] text-emerald-600 pt-1">
                <span>คอมมิชชั่นพนักงาน (รวม)</span><span>{formatCurrency(totalCommission)}</span>
              </div>
            )}

            {mode === 'sale' && (
              <div className="pt-2 border-t border-dashed border-[var(--pink-200)] space-y-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--pink-600)] mb-1.5 flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5" /> ยอดรับชำระสำหรับบิลนี้
                  </label>
                  <div className="rounded-xl border border-[var(--pink-100)] bg-[var(--pink-50)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-secondary)]">ขายปกติ</p>
                        <p className="text-[10px] text-[var(--text-muted)]">รับชำระเต็มตามยอดสุทธิของบิล</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-black text-[var(--pink-600)] shadow-sm">
                        {formatCurrency(payNow)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--pink-50)] rounded-xl border border-[var(--pink-100)] p-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>ยอดเต็ม</span>
                    <span className="font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-xs font-bold text-emerald-700">
                      <span>ส่วนลด/คูปอง</span>
                      <span>-{formatCurrency(discountAmt)}</span>
                    </div>
                  )}
                  {depositDeduct > 0 && (
                    <div className="flex justify-between text-xs font-bold text-amber-700">
                      <span>หักมัดจำเดิม</span>
                      <span>-{formatCurrency(depositDeduct)}</span>
                    </div>
                  )}
                  {showVatOnReceipt && (
                    <>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>มูลค่าก่อน VAT</span>
                        <span className="font-semibold">{formatCurrency(preVatAmount)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>VAT 7% (รวมอยู่ในราคา)</span>
                        <span className="font-semibold">{formatCurrency(vatAmt)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-black text-[var(--pink-600)] border-t border-[var(--pink-100)] pt-1.5">
                    <span>ยอดที่ต้องรับชำระ</span>
                    <span>{formatCurrency(payNow)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Deposit mode panel ─── */}
            {mode === 'deposit' && (
              <div className="pt-2 border-t border-dashed border-amber-200 space-y-3">

                {/* มัดจำ label + shortcuts */}
                <div>
                  <label className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" /> ยอดมัดจำที่รับตอนนี้
                  </label>
                  {/* % shortcuts */}
                  <div className="flex gap-1.5 mb-2">
                    {[30, 50, 70, 100].map(pct => (
                      <button key={pct}
                        onClick={() => setDepositInput(String(Math.round(total * pct / 100)))}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                          depositAmt === Math.round(total * pct / 100) && depositInput !== ''
                            ? 'bg-amber-400 text-white border-amber-400'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}>
                        {pct === 100 ? 'เต็ม' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                  <input type="number" value={depositInput}
                    onChange={e => setDepositInput(e.target.value)}
                    placeholder="หรือพิมพ์จำนวนมัดจำ..."
                    min={0} max={total}
                    className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all" />
                </div>

                {/* สรุป 3 บรรทัด */}
                {depositAmt > 0 && (
                  <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 space-y-1.5">
                    <div className="flex justify-between text-xs text-amber-700">
                      <span>ยอดเต็ม</span>
                      <span className="font-semibold">{formatCurrency(total)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-emerald-700 font-bold">
                      <span>💰 มัดจำ</span>
                      <span>{formatCurrency(depositAmt)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-red-600 font-bold border-t border-amber-200 pt-1.5">
                      <span>ยอดคงเหลือ</span>
                      <span>{formatCurrency(remaining)}</span>
                    </div>
                  </div>
                )}

                {/* วันนัดรับวิก */}
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5 block">
                    📅 วันนัดรับวิก
                  </label>
                  <input type="date" value={pickupDate}
                    onChange={e => setPickupDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
                </div>

                {/* หมายเหตุ */}
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1.5 block">
                    📝 หมายเหตุ
                  </label>
                  <textarea value={depositNote} onChange={e => setDepositNote(e.target.value)}
                    rows={2} placeholder="หมายเหตุเพิ่มเติม..."
                    className="w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
                </div>

                {/* Work Order toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setCreateWorkOrder(v => !v)}
                    className={`w-9 h-5 rounded-full transition-all relative shrink-0 ${createWorkOrder ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0]' : 'bg-gray-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${createWorkOrder ? 'left-4' : 'left-0.5'}`} />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">สร้างใบสั่งผลิตอัตโนมัติ</span>
                </label>

                {/* wig spec fields — shown when createWorkOrder is on */}
                {createWorkOrder && (
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">สเปควิกสำหรับใบสั่งผลิต</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div>
                        <p className="text-[9px] text-purple-500 mb-0.5 font-medium">ประเภทวิก</p>
                        <select
                          value={wigSpec.wigType}
                          onChange={e => setWigSpec(v => ({ ...v, wigType: e.target.value }))}
                          className="w-full px-2 py-1.5 bg-white border border-purple-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-200">
                          <option value="">เลือกประเภท</option>
                          {WIG_TYPE_OPTIONS.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </div>
                      {([
                        ['wigColor', 'สี', 'สีดำ/น้ำตาล'],
                        ['wigLength', 'ความยาว', '20 นิ้ว'],
                      ] as const).map(([k, lbl, ph]) => (
                        <div key={k}>
                          <p className="text-[9px] text-purple-500 mb-0.5 font-medium">{lbl}</p>
                          <input value={wigSpec[k]} onChange={e => setWigSpec(v => ({ ...v, [k]: e.target.value }))}
                            placeholder={ph}
                            className="w-full px-2 py-1.5 bg-white border border-purple-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-200" />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <p className="text-[9px] text-purple-500 mb-0.5 font-medium">โมเดล/แบบ</p>
                        <input value={wigSpec.wigModel} onChange={e => setWigSpec(v => ({ ...v, wigModel: e.target.value }))}
                          placeholder="WIG-001"
                          className="w-full px-2 py-1.5 bg-white border border-purple-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-200" />
                      </div>
                      <div>
                        <p className="text-[9px] text-purple-500 mb-0.5 font-medium">โรงงาน/ผู้ผลิต</p>
                        <input value={wigSpec.manufacturer} onChange={e => setWigSpec(v => ({ ...v, manufacturer: e.target.value }))}
                          placeholder="ชื่อโรงงาน"
                          className="w-full px-2 py-1.5 bg-white border border-purple-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-200" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* หักมัดจำเดิม (เฉพาะโหมดขาย เมื่อลูกค้ามีมัดจำค้าง) */}
          {mode === 'sale' && openDeposits.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-amber-700">💰 หักมัดจำเดิมของลูกค้า</p>
              {openDeposits.map(d => (
                <label key={d.id} className="flex items-center gap-2 text-[11px] cursor-pointer text-amber-800">
                  <input type="checkbox" checked={appliedDepositId === d.id}
                    onChange={() => setAppliedDepositId(appliedDepositId === d.id ? '' : d.id)}
                    className="accent-amber-500" />
                  <span className="flex-1 truncate">{d.depositNo} · มัดจำ {formatCurrency(d.depositAmount)}</span>
                </label>
              ))}
            </div>
          )}

          {mode === 'sale' && hasNegativeStockSale && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                บิลนี้จะทำให้สต๊อกติดลบ {stockShortages.reduce((sum, item) => sum + item.shortageQty, 0)} ชิ้น
              </p>
              <p className="mt-1 text-red-600">ระบบจะให้ยืนยันและบันทึกเหตุผลก่อนออกบิล</p>
            </div>
          )}

          {/* Payment method */}
          <div className="grid grid-cols-4 gap-1.5">
            {payMethods.map(pm => (
              <button key={pm.id} onClick={() => setPayMethod(pm.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-semibold transition-all ${payMethod === pm.id ? `bg-gradient-to-br ${pm.color} text-white shadow-sm` : 'bg-white border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                <pm.icon className="w-4 h-4" />{pm.label}
              </button>
            ))}
          </div>

          {/* แนบสลิป (สำหรับโอน/QR/บัตร) */}
          {payMethod !== 'cash' && (
            <div className="flex items-center gap-2">
              <label className="flex-1 cursor-pointer px-3 py-2 bg-white border border-dashed border-[var(--border-light)] rounded-xl text-xs text-center text-[var(--text-secondary)] hover:bg-[var(--pink-50)] transition-all">
                {slipUploading ? 'กำลังอัปโหลด...' : slipUrl ? '✓ แนบสลิปแล้ว (กดเปลี่ยน)' : '📎 แนบสลิปการชำระ'}
                <input type="file" accept="image/*" className="hidden" onChange={handleSlipUpload} />
              </label>
              {slipUrl && <button type="button" onClick={() => setSlipUrl('')} className="text-xs text-red-500 shrink-0">ลบ</button>}
            </div>
          )}

          {/* Cash input */}
          {payMethod === 'cash' && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input type="number" value={cash} onChange={e => setCash(e.target.value)}
                  placeholder={`รับเงิน ${formatCurrency(payNow)}...`}
                  className="w-full pl-8 pr-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
              </div>
              {parseFloat(cash) > 0 && (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-center shrink-0">
                  <p className="text-[10px] text-emerald-500">ทอน</p>
                  <p className="text-sm font-bold text-emerald-600">{formatCurrency(change)}</p>
                </div>
              )}
            </div>
          )}

          {posMsg && (
            <div className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
              posMsg.type === 'ok'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}>
              {posMsg.text}
            </div>
          )}

          {/* Action button */}
          {mode === 'sale' ? (
            <button onClick={() => requestPaymentConfirm('sale')} disabled={cart.length === 0 || saving} title={discountNeedsApproval ? 'ต้องขออนุมัติส่วนลดก่อนบันทึก' : 'ชำระเงิน'}
              className="sticky bottom-0 z-10 w-full py-3.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white font-bold rounded-2xl shadow-lg shadow-pink-200 active:scale-[0.98] transition-all disabled:opacity-40 text-sm flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</> : `ตรวจสอบและบันทึกขาย · ${formatCurrency(payNow)}`}
            </button>
          ) : (
            <button onClick={() => requestPaymentConfirm('deposit')} disabled={cart.length === 0 || !isDepositReady || saving} title={discountNeedsApproval ? 'ต้องขออนุมัติส่วนลดก่อนบันทึก' : 'รับมัดจำ'}
              className="sticky bottom-0 z-10 w-full py-3.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 active:scale-[0.98] transition-all disabled:opacity-40 text-sm flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</>
                : isDepositReady ? <><Wallet className="w-4 h-4" />ตรวจสอบและบันทึกมัดจำ · {formatCurrency(depositAmt)}</>
                : <><Wallet className="w-4 h-4" />ระบุยอดมัดจำ</>
              }
            </button>
          )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {cart.length > 0 && !checkoutOpen && !paymentConfirm && !receipt && (
      <div className="lg:hidden fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-[var(--border-light)] bg-white/95 p-2 shadow-2xl shadow-pink-200/50 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => document.getElementById('pos-cart-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-[var(--bg-base)] px-3 py-2 text-left"
          >
            <ShoppingCart className="h-4 w-4 shrink-0 text-[var(--pink-500)]" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-[var(--text-primary)]">
                ตะกร้า {cart.length} รายการ · {cart.reduce((s, c) => s + c.quantity, 0)} ชิ้น
              </span>
              <span className="block text-[11px] font-semibold text-[var(--pink-600)]">
                {formatCurrency(mode === 'sale' ? payNow : total)}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setPosMsg(null); setCheckoutOpen(true) }}
            className={`shrink-0 rounded-xl px-4 py-3 text-xs font-black text-white shadow-md ${
              mode === 'sale'
                ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] shadow-pink-200'
                : 'bg-gradient-to-r from-amber-400 to-orange-400 shadow-amber-200'
            }`}
          >
            {mode === 'sale' ? 'ชำระเงิน' : 'มัดจำ'}
          </button>
        </div>
      </div>
    )}

    {paymentConfirm && (
      <PaymentConfirmModal
        action={paymentConfirm}
        amount={payNow}
        methodLabel={paymentMethodLabel}
        payMethod={payMethod}
        hasSlip={Boolean(slipUrl)}
        verified={paymentVerified}
        saving={saving}
        stockShortages={paymentConfirm === 'sale' ? stockShortages : []}
        negativeStockReason={negativeStockReason}
        negativeStockRequiresReason={stockPolicy.requireNegativeStockReason}
        onNegativeStockReasonChange={setNegativeStockReason}
        onVerifiedChange={setPaymentVerified}
        onCancel={() => { setPaymentConfirm(null); setPaymentVerified(false); setNegativeStockReason('') }}
        onConfirm={paymentConfirm === 'sale' ? handleCheckout : handleDeposit}
      />
    )}
    {receipt && <ReceiptModal receipt={receipt} shop={shopInfo} onClose={() => setReceipt(null)} />}
    </>
  )
}

/* ─── Receipt / Deposit Receipt Modal ─── */
const PAY_LABELS: Record<string, string> = {
  cash: 'เงินสด', transfer: 'โอนเงิน', qr: 'QR Code', credit_card: 'บัตรเครดิต',
}

function PaymentConfirmModal({
  action, amount, methodLabel, payMethod, hasSlip, verified, saving,
  stockShortages, negativeStockReason, negativeStockRequiresReason, onNegativeStockReasonChange,
  onVerifiedChange, onCancel, onConfirm,
}: {
  action: PosMode
  amount: number
  methodLabel: string
  payMethod: string
  hasSlip: boolean
  verified: boolean
  saving: boolean
  stockShortages: StockShortage[]
  negativeStockReason: string
  negativeStockRequiresReason: boolean
  onNegativeStockReasonChange: (value: string) => void
  onVerifiedChange: (value: boolean) => void
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const isCash = payMethod === 'cash'
  const hasStockShortage = stockShortages.length > 0
  const confirmDisabled = saving || (hasStockShortage && negativeStockRequiresReason && !negativeStockReason.trim())
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[92vh] rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[var(--border-light)]">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">ยืนยันรับชำระเงิน</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            ตรวจยอดและวิธีชำระก่อนบันทึก{action === 'deposit' ? 'มัดจำ' : 'บิลขาย'}
          </p>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-2xl bg-[var(--bg-base)] border border-[var(--border-light)] p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">ยอดรับชำระ</span>
              <span className="font-bold text-[var(--pink-600)]">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-muted)]">วิธีชำระ</span>
              <span className="font-semibold text-[var(--text-primary)]">{methodLabel}</span>
            </div>
            {!isCash && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--text-muted)]">สลิป</span>
                <span className={hasSlip ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>
                  {hasSlip ? 'แนบแล้ว' : 'ยังไม่แนบ'}
                </span>
              </div>
            )}
          </div>

          {!isCash && (
            <label className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 cursor-pointer">
              <input
                type="checkbox"
                checked={verified}
                onChange={e => onVerifiedChange(e.target.checked)}
                className="mt-1 accent-amber-500"
              />
              <span>
                ตรวจสอบยอดโอน/สลิปแล้ว ให้บันทึกเป็นชำระแล้ว
                {!hasSlip && <span className="block text-xs mt-1">ถ้ายังไม่มีสลิป ระบบจะบันทึกเป็นรอตรวจสอบ และแนบย้อนหลังได้ที่หน้าเอกสาร</span>}
              </span>
            </label>
          )}

          {hasStockShortage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-bold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                ยืนยันขายสต๊อกติดลบ
              </p>
              <div className="mt-2 space-y-1">
                {stockShortages.map(item => (
                  <div key={item.id} className="flex justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate">{item.name}{item.sku ? ` · ${item.sku}` : ''}</span>
                    <span className="shrink-0 font-semibold">{item.stockQty} → {item.stockQty - item.requestedQty}</span>
                  </div>
                ))}
              </div>
              <label className="mt-3 block text-xs font-semibold">
                เหตุผล{negativeStockRequiresReason ? ' *' : ''}
              </label>
              <textarea
                value={negativeStockReason}
                onChange={e => onNegativeStockReasonChange(e.target.value)}
                rows={2}
                placeholder="เช่น ของอยู่หน้าร้านแต่ยังไม่ได้รับเข้า / ขายก่อนตรวจรับโอน"
                className="mt-1 w-full resize-none rounded-xl border border-red-100 bg-white px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-red-200"
              />
              {negativeStockRequiresReason && !negativeStockReason.trim() && (
                <p className="mt-1 text-[11px] text-red-600">ต้องกรอกเหตุผลก่อนบันทึกบิลนี้</p>
              )}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-[var(--border-light)] flex gap-3">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 py-2.5 rounded-2xl border border-[var(--border-light)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] disabled:opacity-50">
            กลับไปแก้ไข
          </button>
          <button onClick={onConfirm} disabled={confirmDisabled}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก</> : action === 'deposit' ? 'ยืนยันและบันทึกมัดจำ' : 'ยืนยันและบันทึกขาย'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiptModal({ receipt, shop, onClose }: { receipt: ReceiptData; shop: ShopInfo; onClose: () => void }) {
  const isDeposit = receipt.mode === 'deposit'
  const receiptShop = receipt.shopInfo ?? shop
  const receiptTitle = isDeposit
    ? 'ใบรับมัดจำ'
    : receipt.showVatOnReceipt
      ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี'
      : 'ใบเสร็จรับเงิน'
  const footerText = receiptShop.receiptFooter || (isDeposit ? 'กรุณาเก็บใบนี้ไว้เป็นหลักฐาน' : 'ขอบคุณที่ใช้บริการ')
  const payerName = receipt.customerName?.trim() || 'ลูกค้าทั่วไป'
  const receiverName = receipt.receiverName?.trim() || '-'
  const nextActions = [
    { href: '/pos', label: 'ขาย/รับมัดจำต่อ', icon: ShoppingCart, show: true },
    { href: receipt.customerId ? `/customers/${receipt.customerId}?tab=timeline` : '', label: 'ดูประวัติลูกค้า', icon: UserRound, show: Boolean(receipt.customerId) },
    { href: receipt.customerId ? `/customers/${receipt.customerId}?tab=photos` : '', label: 'เพิ่มรูป Before/After', icon: ImagePlus, show: Boolean(receipt.customerId) },
    { href: '/production', label: receipt.workOrderCreatedCount ? 'เปิดใบสั่งผลิต' : 'ไปหน้างานผลิต', icon: Factory, show: Boolean(receipt.workOrderCreatedCount) || isDeposit },
    { href: isDeposit ? '/deposits?status=outstanding' : '/documents', label: isDeposit ? 'ดูมัดจำค้าง' : 'ดูประวัติบิล', icon: FileText, show: true },
  ].filter(action => action.show)

  const handlePrint = () => {
    const el = document.getElementById('receipt-content')
    if (!el) return
    const win = window.open('', '_blank', 'width=420,height=700,scrollbars=yes')
    if (!win) { alert('กรุณาอนุญาต popup เพื่อพิมพ์'); return }
    win.document.write(`<!DOCTYPE html><html lang="th"><head>
      <meta charset="utf-8"/>
      <title>${isDeposit ? 'ใบมัดจำ' : 'ใบเสร็จ'} ${receipt.receiptNo}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Sarabun','Noto Sans Thai','Tahoma',sans-serif;font-size:12px;color:#181018;padding:16px;max-width:320px;margin:0 auto;line-height:1.35}
        .center{text-align:center}
        .receipt-paper{width:100%}
        .receipt-head{padding-bottom:8px;border-bottom:1px dashed #9b8c9b}
        .logo{display:block;margin:0 auto 5px;height:40px;max-width:92px;object-fit:contain}
        .shop-name{font-size:18px;font-weight:800;letter-spacing:0;color:#181018}
        .sub{font-size:10.5px;color:#4f4350;margin-bottom:1px;white-space:pre-line}
        .doc-type{display:block;margin:8px auto 0;padding:4px 8px;border-top:1px solid #181018;border-bottom:1px solid #181018;font-size:13px;font-weight:800;color:#181018;text-align:center}
        .meta-box{border:1px solid #181018;border-radius:2px;margin:9px 0 10px;padding:6px 8px}
        .row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:1px 0}
        .label{color:#4f4350}
        .table-head{display:flex;font-size:10.5px;color:#4f4350;font-weight:700;border-bottom:1px solid #181018;padding:0 0 4px;margin-bottom:2px}
        .item-row{display:flex;font-size:11.5px;padding:5px 0;border-bottom:1px solid #eee}
        .item-name{flex:1;min-width:0;overflow:visible;white-space:normal;padding-right:6px}
        .item-name p{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
        .item-qty{width:28px;text-align:center;color:#333}
        .item-price{width:62px;text-align:right;color:#333}
        .item-total{width:64px;text-align:right;font-weight:700;color:#181018}
        .item-note{font-size:10px;color:#4f4350;margin-top:2px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
        .tax-note{font-size:10px;color:#555;margin-top:1px;white-space:normal}
        .summary-box{border-top:1px dashed #9b8c9b;border-bottom:1px dashed #9b8c9b;margin-top:8px;padding:7px 0}
        .total-row{display:flex;justify-content:space-between;font-size:16px;font-weight:900;padding:7px 0;border-top:1px solid #181018;margin-top:5px}
        .deposit-row{display:flex;justify-content:space-between;font-size:12px;font-weight:800;padding:3px 0;color:#181018}
        .remain-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;color:#181018;font-weight:800}
        .change-row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:#181018;font-weight:700}
        .note-box{border:1px solid #181018;border-radius:2px;margin-top:10px;padding:7px 8px;font-size:10.5px;color:#181018;text-align:left;white-space:pre-wrap}
        .signature{margin-top:22px;text-align:center;font-size:10.5px;color:#181018}
        .signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;text-align:center;font-size:10.5px;color:#181018}
        .signature-line{border-top:1px solid #181018;width:150px;margin:0 auto 4px}
        .signature-name{font-weight:700;margin-top:2px;white-space:normal;overflow-wrap:anywhere}
        .footer{text-align:center;margin-top:10px;font-size:10.5px;color:#555}
        @media print{@page{margin:5mm 8mm}body{padding:0}}
      </style>
    </head><body>${el.innerHTML}
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)] shrink-0">
          <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-500" />
            {isDeposit ? 'รับมัดจำสำเร็จ' : 'ชำระเงินสำเร็จ'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-[var(--bg-base)] text-[var(--text-muted)]"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div id="receipt-content" className="receipt-paper font-['Sarabun'] text-[var(--text-primary)]">
            <div className="receipt-head center text-center mb-3 pb-3 border-b border-dashed border-gray-300">
              {receiptShop.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptShop.logoUrl} alt="logo" className="logo mx-auto mb-2 h-10 max-w-[92px] object-contain" />
              )}
              <p className="shop-name text-lg font-black tracking-normal">{receiptShop.nameTh}</p>
              {receipt.branchName && <p className="sub text-xs text-[var(--text-muted)]">สาขา {receipt.branchName}{receipt.branchCode ? ` (${receipt.branchCode})` : ''}</p>}
              {receiptShop.address && <p className="sub text-xs text-[var(--text-muted)] whitespace-pre-line">{receiptShop.address}</p>}
              {receiptShop.phone && <p className="sub text-xs text-[var(--text-muted)]">โทร. {receiptShop.phone}</p>}
              {receiptShop.email && <p className="sub text-xs text-[var(--text-muted)]">{receiptShop.email}</p>}
              {receiptShop.taxId && <p className="sub text-xs text-[var(--text-muted)]">เลขผู้เสียภาษี {receiptShop.taxId}</p>}
              <span className="doc-type block mt-2 border-y border-gray-900 py-1 text-sm font-black text-gray-950">
                {receiptTitle}
              </span>
            </div>

            <div className="meta-box mb-3 rounded-lg border border-gray-900/80 px-3 py-2 space-y-0.5">
              {[
                [isDeposit ? 'เลขที่ใบมัดจำ' : 'เลขที่ใบเสร็จ', receipt.receiptNo],
                ['วันที่', receipt.date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['เวลา', receipt.date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })],
                ...(receipt.customerName ? [['ลูกค้า', receipt.customerName]] : []),
                ['การชำระ', PAY_LABELS[receipt.payMethod] ?? receipt.payMethod],
              ].map(([k, v]) => (
                <div key={k} className="row flex justify-between text-xs">
                  <span className="label text-[var(--text-muted)]">{k}</span>
                  <span className="font-bold text-right">{v}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="table-head flex text-[10px] text-[var(--text-muted)] font-bold mb-1 px-0.5 border-b border-gray-900 pb-1">
                <span className="flex-1">รายการ</span>
                <span className="w-8 text-center">จำนวน</span>
                <span className="w-16 text-right">ราคา</span>
                <span className="w-16 text-right">รวม</span>
              </div>
              {receipt.items.map((item, i) => (
                <div key={i} className="item-row flex text-xs py-1.5 border-b border-[var(--border-light)] last:border-0 px-0.5">
                  <div className="item-name flex-1 min-w-0 pr-1">
                    <p className="font-medium break-words">{item.name}</p>
                    {item.sku && <p className="text-[10px] text-[var(--text-muted)]">{item.sku}</p>}
                    {receipt.showVatOnReceipt && item.taxType === 'non_vat' && <p className="tax-note text-[10px] text-[var(--text-muted)]">ไม่นับ VAT</p>}
                    {item.note?.trim() && <p className="item-note text-[10px] text-purple-700 whitespace-pre-wrap break-words">หมายเหตุ: {item.note.trim()}</p>}
                  </div>
                  <span className="item-qty w-8 text-center text-[var(--text-secondary)]">{item.quantity}</span>
                  <span className="item-price w-16 text-right text-[var(--text-secondary)]">{formatCurrency(item.price)}</span>
                  <span className="item-total w-16 text-right font-semibold">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="summary-box space-y-1.5 text-xs border-y border-dashed border-gray-300 py-2 mt-3">
              <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">ก่อนส่วนลด</span><span>{formatCurrency(receipt.subtotal)}</span></div>
              {receipt.discountAmt > 0 && <div className="row flex justify-between text-emerald-600"><span>ส่วนลด</span><span>-{formatCurrency(receipt.discountAmt)}</span></div>}
              {receipt.showVatOnReceipt && (
                <>
                  <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">มูลค่าก่อน VAT</span><span>{formatCurrency(receipt.preVatAmount)}</span></div>
                  <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">VAT 7% (รวมอยู่ในราคา)</span><span>{formatCurrency(receipt.vatAmt)}</span></div>
                </>
              )}
              {!isDeposit && receipt.depositAmt > 0 && (
                <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">หักมัดจำเดิม</span><span>-{formatCurrency(receipt.depositAmt)}</span></div>
              )}
              <div className="total-row flex justify-between font-bold text-base pt-2 border-t border-gray-300 mt-1">
                <span>ยอดสุทธิ</span><span className="text-[var(--pink-600)]">{formatCurrency(isDeposit ? receipt.total : receipt.remaining)}</span>
              </div>

              {isDeposit && (
                <div className="pt-2 border-t border-dashed border-amber-200 space-y-1">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>ยอดเต็ม</span><span className="font-semibold">{formatCurrency(receipt.total)}</span>
                  </div>
                  <div className="deposit-row flex justify-between font-bold text-amber-700">
                    <span>รับมัดจำ</span><span>{formatCurrency(receipt.depositAmt)}</span>
                  </div>
                  <div className="remain-row flex justify-between font-bold text-red-500 pb-1 border-b border-dashed border-amber-200">
                    <span>ยอดคงเหลือ</span><span>{formatCurrency(receipt.remaining)}</span>
                  </div>
                </div>
              )}

              <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">รับเงิน</span><span>{formatCurrency(receipt.paidAmount)}</span></div>
              {receipt.payMethod === 'cash' && (
                <div className="change-row flex justify-between font-semibold text-emerald-600"><span>เงินทอน</span><span>{formatCurrency(receipt.change)}</span></div>
              )}
            </div>

            {/* วันนัดรับ + หมายเหตุ */}
            {isDeposit && (receipt.pickupDate || receipt.depositNote) && (
              <div className="note-box mt-3 p-3 rounded-lg border border-gray-900/80 bg-white space-y-1.5 text-xs">
                {receipt.pickupDate && (
                  <p className="font-bold text-gray-950">
                    นัดรับวิก: {new Date(receipt.pickupDate).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {receipt.depositNote && (
                  <p className="text-gray-800">หมายเหตุ: {receipt.depositNote}</p>
                )}
              </div>
            )}

            <div className="note-box mt-3 rounded-lg border border-gray-900/80 p-2 text-xs text-gray-800">
              {footerText}
              {isDeposit && receipt.remaining > 0 && (
                <p className="mt-1 font-semibold">ยอดคงเหลือ {formatCurrency(receipt.remaining)} ชำระเมื่อรับวิก</p>
              )}
            </div>

            <div className="signature-grid grid grid-cols-2 gap-4 mt-8 text-center text-[11px] text-gray-900">
              <div>
                <div className="signature-line mx-auto mb-1 w-32 border-t border-gray-900" />
                <p>ผู้ชำระเงิน / Payer</p>
                <p className="signature-name font-bold mt-0.5 break-words">{payerName}</p>
              </div>
              <div>
                <div className="signature-line mx-auto mb-1 w-32 border-t border-gray-900" />
                <p>ผู้รับเงิน / Receiver</p>
                <p className="signature-name font-bold mt-0.5 break-words">{receiverName}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] p-3">
            <p className="text-xs font-bold text-[var(--text-primary)] mb-2">ทำงานต่อ</p>
            <div className="grid grid-cols-2 gap-2">
              {nextActions.map(action => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border-light)] bg-white px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)] transition-all"
                >
                  <action.icon className="h-3.5 w-3.5 text-[var(--pink-500)]" />
                  <span className="min-w-0 truncate">{action.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border-light)] flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-[var(--border-light)] rounded-2xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">ปิด</button>
          <button onClick={handlePrint} className={`flex-1 py-2.5 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all ${isDeposit ? 'bg-gradient-to-r from-amber-400 to-orange-400 shadow-amber-200' : 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] shadow-pink-200'}`}>
            <Printer className="w-4 h-4" /> พิมพ์{isDeposit ? 'ใบมัดจำ' : 'ใบเสร็จ'}
          </button>
        </div>
      </div>
    </div>
  )
}
