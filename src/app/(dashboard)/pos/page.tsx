'use client'
import { useState, useEffect } from 'react'
import {
  Search, Plus, Minus, X, ShoppingCart, Tag,
  Banknote, Smartphone, QrCode, CreditCard, Package,
  Scissors, Check, Loader2, AlertTriangle, Printer, Wallet,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { addDocument, COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Sale, Product, Service, Deposit, WorkOrder } from '@/types'
import { collection, onSnapshot, query, where, getDoc, doc, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { CustomerSearchInput } from '@/components/CustomerSearchInput'

type ProductWithStock = Product & { stockQty?: number }
type PosMode = 'sale' | 'deposit'

interface CartItem {
  id: string; type: 'product' | 'service'; name: string; sku?: string
  price: number; quantity: number; taxType: 'vat' | 'non_vat'; stockQty?: number
}

interface ReceiptData {
  mode:         PosMode
  receiptNo:    string
  customerName: string
  items:        CartItem[]
  subtotal:     number
  discountAmt:  number
  vatAmt:       number
  total:        number
  depositAmt:   number
  remaining:    number
  pickupDate:   string   // วันนัดรับวิก
  depositNote:  string
  payMethod:    string
  paidAmount:   number
  change:       number
  date:         Date
}

interface ShopInfo {
  nameTh:         string
  taxId?:         string
  phone?:         string
  address?:       string
  logoUrl?:       string
  receiptFooter?: string
}

const payMethods = [
  { id: 'cash',        label: 'เงินสด',     icon: Banknote,   color: 'from-emerald-400 to-emerald-500' },
  { id: 'transfer',    label: 'โอนเงิน',    icon: Smartphone, color: 'from-blue-400 to-blue-500'       },
  { id: 'qr',          label: 'QR',          icon: QrCode,     color: 'from-purple-400 to-purple-500'   },
  { id: 'credit_card', label: 'บัตรเครดิต', icon: CreditCard, color: 'from-[#f472b6] to-[#e879a0]'    },
]

export default function POSPage() {
  const { companyId, branchId, userId } = useAuth()
  const [products, setProducts]       = useState<ProductWithStock[]>([])
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
  const [depositInput, setDepositInput] = useState('')
  const [pickupDate, setPickupDate]   = useState('')
  const [depositNote, setDepositNote] = useState('')
  const [saving, setSaving]           = useState(false)
  const [receipt, setReceipt]         = useState<ReceiptData | null>(null)
  const [shopInfo, setShopInfo]       = useState<ShopInfo>({ nameTh: 'WigPro' })
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
    return () => { u1(); u2() }
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    // โหลดข้อมูลร้าน + footer ใบเสร็จ (เก็บใน 2 doc แยกกัน)
    Promise.all([
      getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyId)),
      getDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, `${companyId}_tax`)),
    ]).then(([company, tax]) => {
      const c = company.exists() ? company.data() : {}
      const t = tax.exists() ? tax.data() : {}
      setShopInfo({
        nameTh:        c.nameTh || 'WigPro',
        taxId:         c.taxId || '',
        phone:         c.phone || '',
        address:       c.address || '',
        logoUrl:       c.logoUrl || '',
        receiptFooter: t.receiptFooter || '',
      })
    }).catch(console.error)
  }, [companyId])

  const productCats = ['ทั้งหมด', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))]
  const serviceCats = ['ทั้งหมด', ...Array.from(new Set(services.map(s => s.category).filter(Boolean)))]
  const cats  = tab === 'products' ? productCats : serviceCats

  const q = search.toLowerCase()
  const filteredProducts = products.filter(p =>
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
    const existing = cart.find(c => c.id === item.id && c.type === type)
    if (existing) {
      if (existing.quantity >= stock) return
      setCart(cart.map(c => c.id === item.id && c.type === type ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, { id: item.id, type, name: item.name, sku: 'sku' in item ? item.sku : undefined, price, quantity: 1, taxType: item.taxType ?? 'vat', stockQty: type === 'product' ? (item as ProductWithStock).stockQty : undefined }])
    }
  }
  const remove    = (id: string, type: string) => setCart(cart.filter(c => !(c.id === id && c.type === type)))
  const updateQty = (id: string, type: string, qty: number) => {
    if (qty <= 0) { remove(id, type); return }
    const item = cart.find(c => c.id === id && c.type === type)
    if (item?.stockQty !== undefined && qty > item.stockQty) return
    setCart(cart.map(c => c.id === id && c.type === type ? { ...c, quantity: qty } : c))
  }

  /* ─── Totals ─── */
  const subtotal    = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const discountAmt = discountType === 'percent' ? subtotal * (discount / 100) : discount
  const afterDisc   = subtotal - discountAmt
  const vatAmt      = afterDisc * 0.07
  const total       = afterDisc + vatAmt
  const depositAmt  = Math.min(parseFloat(depositInput) || 0, total)
  const remaining   = total - depositAmt
  const change      = mode === 'sale' ? Math.max((parseFloat(cash) || 0) - total, 0) : Math.max((parseFloat(cash) || 0) - depositAmt, 0)
  const payNow      = mode === 'sale' ? total : depositAmt

  /* ─── Checkout (ขายปกติ) ─── */
  const handleCheckout = () => {
    if (cart.length === 0 || saving) return
    setSaving(true)

    // Generate receipt number locally (no Firestore query)
    const now      = new Date()
    const mm       = String(now.getMonth() + 1).padStart(2, '0')
    const yy       = String(now.getFullYear()).slice(-2)
    const receiptNo = `RCP-${mm}${yy}${String(Date.now()).slice(-5)}`

    const saleData: Record<string, unknown> = {
      companyId, branchId, receiptNo,
      items: cart.map(c => ({ type: c.type, name: c.name, sku: c.sku ?? null, quantity: c.quantity, unitPrice: c.price, discountAmount: 0, taxType: c.taxType, taxAmount: c.price * c.quantity * 0.07, total: c.price * c.quantity })),
      subtotal, discountAmount: discountAmt, discountPercent: discountType === 'percent' ? discount : 0,
      taxAmount: vatAmt, totalAmount: total,
      payments: [{ method: payMethod, amount: total }],
      paidAmount: payMethod === 'cash' ? (parseFloat(cash) || total) : total,
      changeAmount: change, status: 'completed', createdBy: userId,
    }
    if (customerId)   saleData.customerId   = customerId
    if (customerName) saleData.customerName = customerName

    // Fire-and-forget
    addDocument<Sale>(COLLECTIONS.SALES, saleData as Omit<Sale, 'id'>)
      .catch(err => console.error('Sale save error:', err))

    // Show receipt immediately
    setReceipt({ mode: 'sale', receiptNo, customerName: customerName || '', items: [...cart], subtotal, discountAmt, vatAmt, total, depositAmt: total, remaining: 0, pickupDate: '', depositNote: '', payMethod, paidAmount: payMethod === 'cash' ? (parseFloat(cash) || total) : total, change, date: new Date() })
    setCart([]); setCash(''); setDiscount(0); setCustomerName(''); setCustomerId('')
    setSaving(false)
  }

  /* ─── รับมัดจำ ─── */
  const handleDeposit = async () => {
    if (cart.length === 0 || depositAmt <= 0 || saving) return
    setSaving(true)

    // Generate IDs locally — no Firestore round-trip
    const now       = new Date()
    const mm        = String(now.getMonth() + 1).padStart(2, '0')
    const yy        = String(now.getFullYear()).slice(-2)
    const ts        = String(Date.now()).slice(-5)
    const depositNo   = `DEP-${mm}${yy}${ts}`
    const saleOrderId = depositNo

    // Work order number: branch+month+BE year+seq (local fallback)
    const beYear  = String(now.getFullYear() + 543).slice(-2)
    const orderNo = `01${mm}${beYear}${ts}`

    const notesStr = [depositNote, pickupDate ? `นัดรับ: ${pickupDate}` : ''].filter(Boolean).join(' | ')
    const custName = customerName || 'ลูกค้าทั่วไป'
    const custId   = customerId   || ''

    // Fire-and-forget — ไม่รอ
    const depData: Record<string, unknown> = {
      companyId, branchId, depositNo,
      customerId: custId, customerName: custName,
      items: cart.map(c => ({ name: c.name, quantity: c.quantity, unitPrice: c.price, total: c.price * c.quantity })),
      totalAmount: total, depositAmount: depositAmt, paidAmount: depositAmt,
      remainingAmount: remaining, status: remaining <= 0 ? 'paid_full' : 'deposited',
      createdBy: userId,
    }
    if (notesStr) depData.notes = notesStr
    addDocument<Deposit>(COLLECTIONS.DEPOSITS, depData as Omit<Deposit, 'id'>)
      .catch(err => console.error('Deposit save error:', err))

    if (createWorkOrder) {
      const woData: Record<string, unknown> = {
        companyId, branchId, orderNo,
        customerId: custId, customerName: custName,
        saleOrderId, totalAmount: total, depositAmount: depositAmt,
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
      addDocument<WorkOrder>(COLLECTIONS.WORK_ORDERS, woData as Omit<WorkOrder, 'id'>)
        .catch(err => console.error('WorkOrder save error:', err))
    }

    // Show receipt immediately — ไม่ต้องรอ
    setReceipt({ mode: 'deposit', receiptNo: depositNo, customerName: custName, items: [...cart], subtotal, discountAmt, vatAmt, total, depositAmt, remaining, pickupDate, depositNote, payMethod, paidAmount: payMethod === 'cash' ? (parseFloat(cash) || depositAmt) : depositAmt, change, date: now })
    setCart([]); setCash(''); setDiscount(0); setCustomerName(''); setCustomerId(''); setDepositInput(''); setPickupDate(''); setDepositNote('')
    setWigSpec({ wigType: '', wigColor: '', wigLength: '', wigModel: '', manufacturer: '' })
    setSaving(false)
  }

  const isDepositReady = mode === 'deposit' && depositAmt > 0 && depositAmt <= total

  return (
    <>
    <div className="flex flex-col lg:flex-row gap-4" style={{ height: 'calc(100vh - 7.5rem)' }}>

      {/* ── LEFT: Product/Service browser ── */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-light)] space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาสินค้า/บริการ..."
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-base)] border border-[var(--border-light)] rounded-xl text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
          </div>
          <div className="flex gap-2">
            {(['products', 'services'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setFilterCat('ทั้งหมด') }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab === t ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm shadow-pink-200' : 'bg-[var(--bg-base)] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {t === 'products' ? <Package className="w-4 h-4" /> : <Scissors className="w-4 h-4" />}
                {t === 'products' ? `สินค้า (${products.filter(p => p.status !== 'deleted').length})` : `บริการ (${services.filter(s => s.status !== 'deleted').length})`}
              </button>
            ))}
          </div>
          {cats.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {cats.map(cat => (
                <button key={cat} onClick={() => setFilterCat(cat)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${filterCat === cat ? 'bg-[var(--pink-500)] text-white' : 'bg-[var(--bg-base)] border border-[var(--border-light)] text-[var(--text-muted)] hover:bg-[var(--pink-50)]'}`}>
                  {cat}
                </button>
              ))}
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
                const inCart = cart.find(c => c.id === item.id && c.type === (tab === 'products' ? 'product' : 'service'))
                return (
                  <button key={item.id}
                    onClick={() => !outOfStock && addToCart(item as ProductWithStock | Service, tab === 'products' ? 'product' : 'service')}
                    disabled={outOfStock}
                    className={`relative text-left p-3.5 rounded-2xl border transition-all group active:scale-[0.97] ${outOfStock ? 'border-[var(--border-light)] opacity-50 cursor-not-allowed' : inCart ? 'border-[var(--pink-300)] bg-[var(--pink-50)]/70 shadow-md shadow-pink-100' : 'border-[var(--border-light)] hover:border-[var(--pink-200)] hover:bg-[var(--pink-50)]/50 hover:shadow-md hover:shadow-pink-100'}`}>
                    <div className={`aspect-square rounded-xl mb-3 flex items-center justify-center transition-colors ${inCart ? 'bg-[var(--pink-100)]' : 'bg-gradient-to-br from-[var(--pink-50)] to-purple-50'}`}>
                      {tab === 'products' ? <Package className="w-7 h-7 text-[var(--pink-300)]" /> : <Scissors className="w-7 h-7 text-[var(--pink-300)]" />}
                    </div>
                    <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-snug">{item.name}</p>
                    {'sku' in item && item.sku && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{item.sku}</p>}
                    <p className="text-sm font-bold text-[var(--pink-500)] mt-1.5">{formatCurrency('sellingPrice' in item ? item.sellingPrice : item.price)}</p>
                    {tab === 'products' && stock !== null && (
                      <div className={`flex items-center gap-1 mt-1 text-[9px] font-semibold ${outOfStock ? 'text-red-500' : stock <= ((item as ProductWithStock).minStockAlert ?? 5) ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {outOfStock ? <><AlertTriangle className="w-2.5 h-2.5" />หมด</> : stock <= ((item as ProductWithStock).minStockAlert ?? 5) ? <><AlertTriangle className="w-2.5 h-2.5" />เหลือ {stock}</> : <>คงเหลือ {stock}</>}
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
      <div className="w-full lg:w-96 flex flex-col bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">

        {/* Cart header */}
        <div className="p-4 border-b border-[var(--border-light)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-[var(--pink-400)]" /> ตะกร้า
              {cart.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white text-[10px] font-bold flex items-center justify-center">
                  {cart.reduce((s, c) => s + c.quantity, 0)}
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
          ) : cart.map(item => (
            <div key={`${item.id}-${item.type}`} className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-light)]">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{item.name}</p>
                  {item.sku && <p className="text-[10px] text-[var(--text-muted)]">{item.sku}</p>}
                </div>
                <button onClick={() => remove(item.id, item.type)} className="text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(item.id, item.type, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-[var(--pink-50)] border border-[var(--pink-100)] flex items-center justify-center hover:bg-[var(--pink-100)] transition-all text-[var(--pink-500)]"><Minus className="w-3 h-3" /></button>
                  <span className="w-6 text-center text-sm font-bold text-[var(--text-primary)]">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, item.type, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-[var(--pink-50)] border border-[var(--pink-100)] flex items-center justify-center hover:bg-[var(--pink-100)] transition-all text-[var(--pink-500)]"><Plus className="w-3 h-3" /></button>
                </div>
                <p className="font-bold text-sm text-[var(--pink-500)]">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary + Pay */}
        <div className="p-4 border-t border-[var(--border-light)] space-y-3 bg-[var(--bg-base)]/50">

          {/* Discount */}
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input type="number" value={discount || ''} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} placeholder="ส่วนลด"
              className="flex-1 px-3 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
            <select value={discountType} onChange={e => setDiscountType(e.target.value as 'percent' | 'amount')}
              className="px-2 py-1.5 bg-white border border-[var(--border-light)] rounded-lg text-xs focus:outline-none">
              <option value="percent">%</option>
              <option value="amount">฿</option>
            </select>
          </div>

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
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>VAT 7%</span><span>{formatCurrency(vatAmt)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-[var(--border-light)]">
              <span className="text-[var(--text-primary)]">ยอดรวม</span>
              <span className="text-[var(--pink-500)]">{formatCurrency(total)}</span>
            </div>

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
                  <span className="text-xs font-semibold text-[var(--text-primary)]">🏭 สร้าง Work Order อัตโนมัติ</span>
                </label>

                {/* wig spec fields — shown when createWorkOrder is on */}
                {createWorkOrder && (
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">สเปควิก (สำหรับ Work Order)</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ['wigType',  'ประเภท', 'สั้น/ยาว/กลาง'],
                        ['wigColor', 'สี',     'สีดำ/น้ำตาล'],
                        ['wigLength','ความยาว','20 นิ้ว'],
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

          {/* Payment method */}
          <div className="grid grid-cols-4 gap-1.5">
            {payMethods.map(pm => (
              <button key={pm.id} onClick={() => setPayMethod(pm.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-semibold transition-all ${payMethod === pm.id ? `bg-gradient-to-br ${pm.color} text-white shadow-sm` : 'bg-white border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                <pm.icon className="w-4 h-4" />{pm.label}
              </button>
            ))}
          </div>

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

          {/* Action button */}
          {mode === 'sale' ? (
            <button onClick={handleCheckout} disabled={cart.length === 0 || saving}
              className="w-full py-3.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white font-bold rounded-2xl shadow-lg shadow-pink-200 active:scale-[0.98] transition-all disabled:opacity-40 text-sm flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</> : `ชำระเงิน · ${formatCurrency(total)}`}
            </button>
          ) : (
            <button onClick={handleDeposit} disabled={cart.length === 0 || !isDepositReady || saving}
              className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 active:scale-[0.98] transition-all disabled:opacity-40 text-sm flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</>
                : isDepositReady ? <><Wallet className="w-4 h-4" />รับมัดจำ · {formatCurrency(depositAmt)}</>
                : <><Wallet className="w-4 h-4" />ระบุยอดมัดจำ</>
              }
            </button>
          )}
        </div>
      </div>
    </div>

    {receipt && <ReceiptModal receipt={receipt} shop={shopInfo} onClose={() => setReceipt(null)} />}
    </>
  )
}

/* ─── Receipt / Deposit Receipt Modal ─── */
const PAY_LABELS: Record<string, string> = {
  cash: 'เงินสด', transfer: 'โอนเงิน', qr: 'QR Code', credit_card: 'บัตรเครดิต',
}

function ReceiptModal({ receipt, shop, onClose }: { receipt: ReceiptData; shop: ShopInfo; onClose: () => void }) {
  const isDeposit = receipt.mode === 'deposit'
  const footerText = shop.receiptFooter || (isDeposit ? '📌 กรุณาเก็บใบนี้ไว้เป็นหลักฐาน' : 'ขอบคุณที่ใช้บริการ 💗')

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
        body{font-family:'Sarabun','Noto Sans Thai',sans-serif;font-size:13px;color:#3a1a3a;padding:20px;max-width:300px;margin:0 auto}
        .center{text-align:center}
        .logo{display:block;margin:0 auto 6px;height:48px;object-fit:contain}
        .shop-name{font-size:20px;font-weight:700}
        .sub{font-size:11px;color:#888;margin-bottom:2px;white-space:pre-line}
        .doc-type{display:inline-block;margin:6px 0;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;${isDeposit ? 'background:#fff3cd;color:#856404;border:1px solid #ffc107' : 'background:#fce4ee;color:#cc2d65;border:1px solid #f9c8dd'}}
        .divider{border:none;border-top:1px dashed #ccc;margin:10px 0}
        .row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
        .label{color:#888}
        .item-row{display:flex;font-size:12px;padding:4px 0;border-bottom:1px solid #f0e8f0}
        .item-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px}
        .item-qty{width:30px;text-align:center;color:#555}
        .item-price{width:60px;text-align:right;color:#555}
        .item-total{width:65px;text-align:right;font-weight:600}
        .total-row{display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:6px 0;border-top:1px solid #ccc;margin-top:4px}
        .deposit-row{display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:4px 0;color:#856404}
        .remain-row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:#dc3545;font-weight:600}
        .change-row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:#16803d;font-weight:600}
        .footer{text-align:center;margin-top:12px;font-size:11px;color:#aaa}
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
          <div id="receipt-content" className="font-['Sarabun'] text-[var(--text-primary)]">
            <div className="center text-center mb-4 pb-3 border-b border-dashed border-gray-300">
              {shop.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shop.logoUrl} alt="logo" className="logo mx-auto mb-2 h-12 object-contain" />
              )}
              <p className="shop-name text-lg font-bold">{shop.nameTh}</p>
              {shop.address && <p className="sub text-xs text-[var(--text-muted)] whitespace-pre-line">{shop.address}</p>}
              {shop.phone && <p className="sub text-xs text-[var(--text-muted)]">โทร. {shop.phone}</p>}
              {shop.taxId && <p className="sub text-xs text-[var(--text-muted)]">เลขผู้เสียภาษี {shop.taxId}</p>}
              {isDeposit && (
                <span className="doc-type inline-block mt-2 px-3 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  💰 ใบรับมัดจำ
                </span>
              )}
            </div>

            <div className="mb-3 space-y-0.5">
              {[
                [isDeposit ? 'เลขที่ใบมัดจำ' : 'เลขที่ใบเสร็จ', receipt.receiptNo],
                ['วันที่', receipt.date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['เวลา', receipt.date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })],
                ...(receipt.customerName ? [['ลูกค้า', receipt.customerName]] : []),
                ['การชำระ', PAY_LABELS[receipt.payMethod] ?? receipt.payMethod],
              ].map(([k, v]) => (
                <div key={k} className="row flex justify-between text-xs">
                  <span className="label text-[var(--text-muted)]">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-gray-300 pt-3">
              <div className="flex text-[10px] text-[var(--text-muted)] mb-1 px-0.5">
                <span className="flex-1">รายการ</span>
                <span className="w-8 text-center">จำนวน</span>
                <span className="w-16 text-right">ราคา</span>
                <span className="w-16 text-right">รวม</span>
              </div>
              {receipt.items.map((item, i) => (
                <div key={i} className="item-row flex text-xs py-1.5 border-b border-[var(--border-light)] last:border-0 px-0.5">
                  <div className="item-name flex-1 min-w-0 pr-1">
                    <p className="font-medium truncate">{item.name}</p>
                    {item.sku && <p className="text-[10px] text-[var(--text-muted)]">{item.sku}</p>}
                  </div>
                  <span className="item-qty w-8 text-center text-[var(--text-secondary)]">{item.quantity}</span>
                  <span className="item-price w-16 text-right text-[var(--text-secondary)]">{formatCurrency(item.price)}</span>
                  <span className="item-total w-16 text-right font-semibold">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 text-xs border-t border-dashed border-gray-300 pt-3 mt-3">
              <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">ก่อนส่วนลด</span><span>{formatCurrency(receipt.subtotal)}</span></div>
              {receipt.discountAmt > 0 && <div className="row flex justify-between text-emerald-600"><span>ส่วนลด</span><span>-{formatCurrency(receipt.discountAmt)}</span></div>}
              <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">VAT 7%</span><span>{formatCurrency(receipt.vatAmt)}</span></div>
              <div className="total-row flex justify-between font-bold text-base pt-2 border-t border-gray-300 mt-1">
                <span>ยอดรวม</span><span className="text-[var(--pink-600)]">{formatCurrency(receipt.total)}</span>
              </div>

              {isDeposit && (
                <div className="pt-2 border-t border-dashed border-amber-200 space-y-1">
                  <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                    <span>ยอดเต็ม</span><span className="font-semibold">{formatCurrency(receipt.total)}</span>
                  </div>
                  <div className="deposit-row flex justify-between font-bold text-amber-700">
                    <span>💰 มัดจำ</span><span>{formatCurrency(receipt.depositAmt)}</span>
                  </div>
                  <div className="remain-row flex justify-between font-bold text-red-500 pb-1 border-b border-dashed border-amber-200">
                    <span>ยอดคงเหลือ</span><span>{formatCurrency(receipt.remaining)}</span>
                  </div>
                </div>
              )}

              {receipt.payMethod === 'cash' && (
                <>
                  <div className="row flex justify-between"><span className="label text-[var(--text-muted)]">รับเงิน</span><span>{formatCurrency(receipt.paidAmount)}</span></div>
                  <div className="change-row flex justify-between font-semibold text-emerald-600"><span>เงินทอน</span><span>{formatCurrency(receipt.change)}</span></div>
                </>
              )}
            </div>

            {/* วันนัดรับ + หมายเหตุ */}
            {isDeposit && (receipt.pickupDate || receipt.depositNote) && (
              <div className="mt-3 p-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 space-y-1.5 text-xs">
                {receipt.pickupDate && (
                  <p className="font-bold text-amber-800">
                    📅 นัดรับวิก: {new Date(receipt.pickupDate).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {receipt.depositNote && (
                  <p className="text-amber-700">📝 {receipt.depositNote}</p>
                )}
              </div>
            )}

            <div className="text-center pt-4 mt-3 border-t border-dashed border-gray-300">
              <p className="text-xs text-[var(--text-muted)]">{footerText}</p>
              {isDeposit && receipt.remaining > 0 && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">ยอดคงเหลือ {formatCurrency(receipt.remaining)} ชำระเมื่อรับวิก</p>
              )}
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
