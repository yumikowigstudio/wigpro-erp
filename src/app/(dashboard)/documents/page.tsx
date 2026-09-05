'use client'
import { CancelFinancialDocument } from '@/components/CancelFinancialDocument'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatDate, formatCurrency } from '@/lib/utils'
import {
  CheckCircle2, Download, Eye, FileText, Loader2,
  Pencil, Printer, Receipt, Search, X,
} from 'lucide-react'
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { Deposit, DepositStatus, PaymentMethod, PaymentStatus, Sale, SaleStatus } from '@/types'
import Link from 'next/link'
import { writeActivityLog } from '@/lib/activityLog'
import { attachSaleSlip, confirmSalePayment } from '@/lib/salePayments'

const docTypeConfig = {
  quotation:       { label: 'ใบเสนอราคา',     color: 'bg-blue-100 text-blue-700'       },
  deposit_receipt: { label: 'ใบมัดจำ',         color: 'bg-amber-100 text-amber-700'     },
  receipt:         { label: 'ใบเสร็จรับเงิน',  color: 'bg-emerald-100 text-emerald-700' },
  tax_invoice:     { label: 'ใบกำกับภาษี',     color: 'bg-purple-100 text-purple-700'   },
  work_order:      { label: 'ใบสั่งผลิตวิก',   color: 'bg-[#f5ede3] text-[var(--pink-600)]' },
}

const paymentLabels: Record<PaymentMethod | string, string> = {
  cash: 'เงินสด / Cash',
  transfer: 'โอนเงิน / Transfer',
  qr: 'QR Code',
  credit_card: 'บัตรเครดิต / Credit Card',
}

const paymentStatusConfig: Record<PaymentStatus | 'unknown', { label: string; color: string }> = {
  confirmed: { label: 'ชำระแล้ว', color: 'bg-emerald-100 text-emerald-700' },
  pending:   { label: 'รอตรวจสอบ', color: 'bg-amber-100 text-amber-700' },
  rejected:  { label: 'ไม่ผ่าน', color: 'bg-red-100 text-red-700' },
  unknown:   { label: 'ไม่ระบุ', color: 'bg-gray-100 text-gray-600' },
}

const saleStatusConfig: Record<SaleStatus, { label: string; color: string }> = {
  completed: { label: 'ปกติ', color: 'bg-emerald-50 text-emerald-700' },
  pending:   { label: 'รอชำระ', color: 'bg-amber-50 text-amber-700' },
  returned:  { label: 'คืนสินค้า', color: 'bg-blue-50 text-blue-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-50 text-red-700' },
}

const depositStatusConfig: Record<DepositStatus, { label: string; color: string }> = {
  pending:   { label: 'รอมัดจำ', color: 'bg-amber-50 text-amber-700' },
  deposited: { label: 'มัดจำแล้ว', color: 'bg-blue-50 text-blue-700' },
  paid_full: { label: 'ชำระครบ', color: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-50 text-red-700' },
}

const uniqReceiptTexts = (values: string[]) =>
  Array.from(new Set(values.map(v => v.trim()).filter(Boolean)))

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

interface DocItem {
  id:           string
  type:         keyof typeof docTypeConfig
  docNo:        string
  customerName: string
  amount:       number
  createdAt:    Date
  sourceId:     string
  sourceType:   'receipt' | 'deposit' | 'work_order'
  branchName?:   string
  sale?:        Sale
  deposit?:     Deposit
}

export default function DocumentsPage() {
  const { companyId, branchId, userId, userName } = useAuth()
  const { ensurePermission, hasPermission } = usePermissionAction()
  const [docs, setDocs] = useState<DocItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const searchParams = useSearchParams()
  useEffect(() => { setSearch(searchParams.get('q') ?? '') }, [searchParams])
  const [filterType, setFilterType] = useState('')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [editForm, setEditForm] = useState({ customerName: '', customerPhone: '', receiptNote: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!companyId || !branchId) return

    let receipts: DocItem[] = []
    let deposits: DocItem[] = []
    let workOrders: DocItem[] = []
    let loaded = 0
    const done = () => { loaded++; if (loaded === 3) setLoading(false) }

    const merge = () => {
      const all = [...receipts, ...deposits, ...workOrders]
      all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setDocs(all)
    }

    const q1 = query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId), where('branchId', '==', branchId))
    const u1 = onSnapshot(q1, snap => {
      receipts = snap.docs.map(d => {
        const data = convertTimestamps(d.data()) as Omit<Sale, 'id'>
        const sale = { id: d.id, ...data } as Sale
        return {
          id: d.id,
          type: 'receipt' as const,
          docNo: sale.receiptNo ?? d.id,
          customerName: sale.customerName ?? 'ลูกค้าทั่วไป',
          amount: sale.totalAmount ?? 0,
          createdAt: sale.createdAt instanceof Date ? sale.createdAt : new Date(),
          sourceId: d.id,
          sourceType: 'receipt' as const,
          branchName: sale.branchName,
          sale,
        }
      })
      merge(); done()
    }, () => done())

    const q2 = query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId), where('branchId', '==', branchId))
    const u2 = onSnapshot(q2, snap => {
      deposits = snap.docs.map(d => {
        const data = convertTimestamps(d.data()) as Omit<Deposit, 'id'>
        const deposit = { id: d.id, ...data } as Deposit
        return {
          id: d.id,
          type: 'deposit_receipt' as const,
          docNo: deposit.depositNo ?? d.id,
          customerName: deposit.customerName ?? '-',
          amount: deposit.depositAmount ?? 0,
          createdAt: deposit.createdAt instanceof Date ? deposit.createdAt : new Date(),
          sourceId: d.id,
          sourceType: 'deposit' as const,
          branchName: deposit.branchName,
          deposit,
        }
      })
      merge(); done()
    }, () => done())

    const q3 = query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', companyId), where('branchId', '==', branchId))
    const u3 = onSnapshot(q3, snap => {
      workOrders = snap.docs.map(d => {
        const data = convertTimestamps(d.data())
        return {
          id: d.id,
          type: 'work_order' as const,
          docNo: data.orderNo ?? d.id,
          customerName: data.customerName ?? '-',
          amount: data.totalPrice ?? data.price ?? data.totalAmount ?? 0,
          createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
          sourceId: d.id,
          sourceType: 'work_order' as const,
          branchName: data.branchName,
        }
      })
      merge(); done()
    }, () => done())

    return () => { u1(); u2(); u3() }
  }, [branchId, companyId])

  const filtered = useMemo(() => docs.filter(d => {
    const q = search.toLowerCase()
    return (!q || [d.docNo, d.customerName].some(v => v.toLowerCase().includes(q)))
      && (!filterType || d.type === filterType)
  }), [docs, filterType, search])

  const openSale = (sale: Sale) => {
    setSelectedSale(sale)
    setEditForm({
      customerName: sale.customerName ?? '',
      customerPhone: sale.customerPhone ?? '',
      receiptNote: sale.receiptNote ?? '',
      notes: sale.notes ?? '',
    })
    setMessage('')
  }

  const activeSale = selectedSale ? (docs.find(d => d.sourceId === selectedSale.id)?.sale ?? selectedSale) : null
  const firstPayment = activeSale?.payments?.[0]
  const paymentStatus = activeSale?.paymentStatus ?? (activeSale?.status === 'completed' ? 'confirmed' : 'pending')
  const paymentCfg = paymentStatusConfig[paymentStatus] ?? paymentStatusConfig.unknown
  const canEditBill = hasPermission('action.sales.editBill')
  const canAttachSlip = hasPermission('action.sales.attachSlip')
  const canConfirmPayment = hasPermission('action.sales.confirmPayment')

  const saveSaleText = async () => {
    if (!activeSale) return
    if (!await ensurePermission('action.sales.editBill', 'แก้ไขบิลย้อนหลัง')) return
    setSaving(true)
    setMessage('')
    try {
      await updateDoc(doc(db, COLLECTIONS.SALES, activeSale.id), {
        customerName: editForm.customerName.trim() || 'ลูกค้าทั่วไป',
        customerPhone: editForm.customerPhone.trim(),
        receiptNote: editForm.receiptNote.trim(),
        notes: editForm.notes.trim(),
        updatedAt: serverTimestamp(),
      })
      await writeActivityLog({
        companyId,
        branchId: activeSale.branchId || branchId,
        userId,
        userName,
        action: 'update',
        module: 'ประวัติบิล',
        description: `แก้ไขข้อมูลบิล ${activeSale.receiptNo ?? activeSale.id}`,
        recordId: activeSale.id,
        recordType: 'sale',
        metadata: { receiptNo: activeSale.receiptNo, totalAmount: activeSale.totalAmount },
      })
      setMessage('บันทึกข้อมูลบิลแล้ว')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const uploadSlip = async (file?: File) => {
    if (!activeSale || !file) return
    if (!await ensurePermission('action.sales.attachSlip', 'แนบ/เปลี่ยนสลิปย้อนหลัง')) return
    if (!file.type.startsWith('image/')) { setMessage('กรุณาเลือกไฟล์รูปภาพ'); return }
    if (file.size > 5 * 1024 * 1024) { setMessage('ไฟล์ใหญ่เกิน 5MB'); return }
    setUploading(true)
    setMessage('')
    try {
      const slipUrl = await uploadToCloudinary(file, 'wigpro/slips')
      await attachSaleSlip(activeSale, slipUrl, { userId, userName })
      setMessage('แนบสลิปแล้ว')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'อัปโหลดสลิปไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  const confirmPayment = async () => {
    if (!activeSale) return
    if (!await ensurePermission('action.sales.confirmPayment', 'ยืนยันการชำระเงิน')) return
    setSaving(true)
    setMessage('')
    try {
      await confirmSalePayment(activeSale, { userId, userName })
      setMessage('ยืนยันการชำระเงินแล้ว')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }


  const printSale = (sale: Sale) => {
    const win = window.open('', '_blank', 'width=420,height=720,scrollbars=yes')
    if (!win) { setMessage('กรุณาอนุญาต popup เพื่อพิมพ์'); return }
    const showVat = sale.showVatOnReceipt ?? ((sale.taxAmount ?? 0) > 0)
    const preVatAmount = sale.preVatAmount ?? Math.max((sale.totalAmount ?? 0) - (sale.taxAmount ?? 0), 0)
    const rows = sale.items.map(item => `
      <div class="item-row">
        <div class="item-main">
          <div class="item-name">
            <div class="item-title">${escapeHtml(item.name)}</div>
            ${item.sku ? `<div class="item-meta">${escapeHtml(item.sku)}</div>` : ''}
            <div class="item-meta">${item.quantity} x ${formatCurrency(item.unitPrice)}</div>
            ${showVat && item.taxType === 'non_vat' ? '<div class="line-note">ไม่นับ VAT / Non-VAT</div>' : ''}
            ${item.note ? `<div class="line-note">หมายเหตุ / Note: ${escapeHtml(item.note)}</div>` : ''}
          </div>
          <div class="item-total">${formatCurrency(item.total)}</div>
        </div>
      </div>`).join('')
    const receiptInfo = sale.receiptInfo
    const shopName = receiptInfo?.nameTh || ''
    const branchName = receiptInfo?.branchName || sale.branchName || ''
    const branchCode = receiptInfo?.branchCode || sale.branchCode || ''
    const saleDate = sale.createdAt instanceof Date ? sale.createdAt : new Date(sale.createdAt)
    const receiptTitle = showVat ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี\nReceipt / Tax Invoice' : 'ใบเสร็จรับเงิน\nReceipt'
    const paymentMethod = paymentLabels[sale.payments?.[0]?.method ?? 'cash'] ?? sale.payments?.[0]?.method ?? '-'
    const depositDeducted = sale.depositDeducted ?? 0
    const amountDue = Math.max((sale.totalAmount ?? 0) - depositDeducted, 0)
    const paidAmount = sale.paidAmount ?? sale.payments?.[0]?.amount ?? amountDue
    const changeAmount = sale.changeAmount ?? 0
    const footerText = uniqReceiptTexts([sale.receiptNote ?? '', receiptInfo?.receiptFooter || 'ขอบคุณที่ใช้บริการ / Thank you.']).join('\n')
    const payerName = sale.customerName?.trim() || 'ลูกค้าทั่วไป / Walk-in customer'
    const receiverName = sale.receivedByName?.trim()
      || sale.createdByName?.trim()
      || sale.paymentConfirmedByName?.trim()
      || sale.createdBy
      || '-'
    win.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/>
      <title>ใบเสร็จ ${sale.receiptNo}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Sarabun','Noto Sans Thai','Tahoma',sans-serif;color:#181018;padding:16px;max-width:320px;margin:auto;font-size:12px;line-height:1.35}
        .shop{text-align:center;padding-bottom:8px;border-bottom:1px dashed #9b8c9b}
        .shop-name{font-weight:800;font-size:18px;color:#181018}.shop-sub{font-size:10.5px;color:#4f4350;white-space:pre-line}.logo{height:40px;max-width:92px;object-fit:contain;margin:0 auto 5px;display:block}
        h1{text-align:center;font-size:13px;font-weight:800;margin:8px 0 0;padding:4px 8px;border-top:1px solid #181018;border-bottom:1px solid #181018;color:#181018;line-height:1.25;white-space:pre-line}
        .meta-box{border:1px solid #181018;border-radius:2px;margin:9px 0 10px;padding:6px 8px}
        .muted{color:#4f4350}.row{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:1px 0}.right{text-align:right}.center{text-align:center}
        .total{font-weight:900;font-size:16px;border-top:1px solid #181018;padding-top:7px;margin-top:5px;color:#181018}
        .items{margin-top:8px}.table-head{display:grid;grid-template-columns:1fr 86px;gap:8px;border-bottom:1px solid #181018;padding:0 2px 4px;text-align:left;font-size:10.5px;color:#4f4350;font-weight:700}.table-head span:last-child{text-align:right}
        .item-row{font-size:11.5px;padding:7px 2px;border-bottom:1px solid #eee}.item-main{display:grid;grid-template-columns:minmax(0,1fr) 86px;gap:8px;align-items:start}.item-title{font-weight:700;overflow-wrap:anywhere}.item-name{min-width:0}.item-meta{font-size:10px;color:#4f4350;margin-top:2px;line-height:1.35}.item-total{text-align:right;font-weight:800;white-space:nowrap;color:#181018}
        .cancel{color:#b91c1c;text-align:center;font-weight:800;margin:8px 0;border:1px solid #b91c1c;padding:4px}
        .line-note{font-size:10px;color:#7c4a7c;margin-top:3px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;border-left:2px solid #e8d9e8;padding-left:5px}
        .summary-box{border-top:1px dashed #9b8c9b;border-bottom:1px dashed #9b8c9b;margin-top:8px;padding:7px 0}
        .note-box{border:1px solid #181018;border-radius:2px;margin-top:10px;padding:7px 8px;font-size:10.5px;color:#181018;text-align:left;white-space:pre-wrap;line-height:1.45;overflow-wrap:anywhere;word-break:break-word}
        .signature{margin-top:22px;text-align:center;font-size:10.5px;color:#181018}.signature-line{border-top:1px solid #181018;width:150px;margin:0 auto 4px}
        .signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px;text-align:center;font-size:10.5px;color:#181018}.signature-name{font-weight:700;margin-top:2px;white-space:normal;overflow-wrap:anywhere}
        @media print{@page{margin:5mm 8mm}body{padding:0}}
      </style></head><body>
      ${receiptInfo ? `<div class="shop">
        ${receiptInfo.logoUrl ? `<img class="logo" src="${receiptInfo.logoUrl}" alt="logo"/>` : ''}
        ${shopName ? `<div class="shop-name">${escapeHtml(shopName)}</div>` : ''}
        ${branchName ? `<div class="shop-sub">สาขา ${escapeHtml(branchName)}${branchCode ? ` (${escapeHtml(branchCode)})` : ''}</div>` : ''}
        ${receiptInfo.address ? `<div class="shop-sub">${escapeHtml(receiptInfo.address)}</div>` : ''}
        ${receiptInfo.phone ? `<div class="shop-sub">โทร. ${escapeHtml(receiptInfo.phone)}</div>` : ''}
        ${receiptInfo.email ? `<div class="shop-sub">${escapeHtml(receiptInfo.email)}</div>` : ''}
        ${receiptInfo.taxId ? `<div class="shop-sub">เลขผู้เสียภาษี ${escapeHtml(receiptInfo.taxId)}</div>` : ''}
      </div>` : ''}
      <h1>${receiptTitle}</h1>
      ${sale.status === 'cancelled' ? '<div class="cancel">บิลถูกยกเลิก</div>' : ''}
      ${!receiptInfo && branchName ? `<div class="row"><span class="muted">สาขา</span><span>${branchName}${branchCode ? ` (${branchCode})` : ''}</span></div>` : ''}
      <div class="meta-box">
        <div class="row"><span class="muted">เลขที่ใบเสร็จ / Receipt No.</span><strong>${escapeHtml(sale.receiptNo)}</strong></div>
        <div class="row"><span class="muted">วันที่ / Date</span><span>${saleDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
        <div class="row"><span class="muted">เวลา / Time</span><span>${saleDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div class="row"><span class="muted">ลูกค้า / Customer</span><span>${escapeHtml(sale.customerName ?? 'ลูกค้าทั่วไป / Walk-in customer')}</span></div>
        ${sale.customerPhone ? `<div class="row"><span class="muted">เบอร์โทร / Phone</span><span>${escapeHtml(sale.customerPhone)}</span></div>` : ''}
        <div class="row"><span class="muted">การชำระ / Payment</span><strong>${escapeHtml(paymentMethod)}</strong></div>
      </div>
      <div class="items">
        <div class="table-head"><span>รายการ / Item</span><span>จำนวน x ราคา / Amount</span></div>
        ${rows}
      </div>
      <div class="summary-box">
        <div class="row"><span class="muted">${showVat ? 'รวมเป็นเงิน / Subtotal' : 'รวมเป็นเงิน / Total'}</span><span>${formatCurrency(sale.subtotal)}</span></div>
        ${sale.discountAmount > 0 ? `<div class="row"><span class="muted">ส่วนลด / Discount</span><span>-${formatCurrency(sale.discountAmount)}</span></div>` : ''}
        ${showVat ? `
          <div class="row"><span class="muted">มูลค่าก่อน VAT / Amount before VAT</span><span>${formatCurrency(preVatAmount)}</span></div>
          <div class="row"><span class="muted">ภาษีมูลค่าเพิ่ม 7% / VAT 7%</span><span>${formatCurrency(sale.taxAmount)}</span></div>
        ` : ''}
        ${depositDeducted > 0 ? `<div class="row"><span class="muted">หักมัดจำ / Deposit deducted</span><span>-${formatCurrency(depositDeducted)}</span></div>` : ''}
        <div class="row total"><span>${depositDeducted > 0 ? 'ยอดที่ต้องชำระ / Amount Due' : 'รวมทั้งสิ้น / Grand Total'}</span><span>${formatCurrency(amountDue)}</span></div>
        <div class="row"><span class="muted">รับเงิน / Amount Paid</span><span>${formatCurrency(paidAmount)}</span></div>
        ${(sale.payments?.[0]?.method ?? '') === 'cash' ? `<div class="row"><span class="muted">เงินทอน / Change</span><span>${formatCurrency(changeAmount)}</span></div>` : ''}
      </div>
      <div class="note-box">${escapeHtml(footerText)}</div>
      <div class="signature-grid">
        <div><div class="signature-line"></div><div>ผู้ชำระเงิน / Payer</div><div class="signature-name">${escapeHtml(payerName)}</div></div>
        <div><div class="signature-line"></div><div>ผู้รับเงิน / Receiver</div><div class="signature-name">${escapeHtml(receiverName)}</div></div>
      </div>
      <script>window.onload=()=>window.print()</script>
      </body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">เอกสารและประวัติบิล</h1>
          <p className="text-sm text-[var(--text-muted)]">{loading ? '...' : `${filtered.length} ฉบับ`}</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-xs text-[var(--text-muted)]">
          <Receipt className="w-3.5 h-3.5 text-[var(--pink-400)]" />
          <span>ดูใบเสร็จ แนบสลิป ยืนยันชำระ และยกเลิกบิล</span>
        </div>
      </div>

      {!loading && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterType('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!filterType ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
            ทั้งหมด ({docs.length})
          </button>
          {(Object.entries(docTypeConfig) as [string, { label: string; color: string }][]).map(([k, v]) => {
            const count = docs.filter(d => d.type === k).length
            if (!count) return null
            return (
              <button key={k} onClick={() => setFilterType(k)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filterType === k ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {v.label} ({count})
              </button>
            )
          })}
        </div>
      )}

      {message && !activeSale && (
        <div className="rounded-2xl border border-[var(--border-light)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)] shadow-sm">
          {message}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาเลขเอกสาร ชื่อลูกค้า..."
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
          <option value="">ประเภทเอกสารทั้งหมด</option>
          {Object.entries(docTypeConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FileText className="w-14 h-14 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] text-sm">
            {docs.length === 0 ? 'ยังไม่มีเอกสาร เอกสารจะแสดงหลังจากมีการขาย มัดจำ หรือสั่งผลิตวิก' : 'ไม่พบเอกสารที่ค้นหา'}
          </p>
          {docs.length === 0 && (
            <div className="flex gap-3 mt-2">
              <Link href="/pos" className="px-4 py-2 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-all">
                ไปที่ POS ขาย
              </Link>
              <Link href="/deposits" className="px-4 py-2 border border-[var(--border-light)] bg-white text-[var(--text-secondary)] rounded-xl text-xs font-semibold hover:bg-[var(--bg-base)] transition-all">
                รับมัดจำ
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[var(--border-light)] divide-y divide-[var(--border-light)]">
          {filtered.map(item => {
            const cfg = docTypeConfig[item.type]
            const saleStatus = item.sale?.status ? saleStatusConfig[item.sale.status] : null
            const depositStatus = item.deposit?.status ? depositStatusConfig[item.deposit.status] : null
            const isCancelled = item.sale?.status === 'cancelled' || item.deposit?.status === 'cancelled'
            const payStatus = item.sale
              ? paymentStatusConfig[item.sale.paymentStatus ?? (item.sale.status === 'completed' ? 'confirmed' : 'pending')]
              : null
            return (
              <div key={`${item.sourceType}-${item.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-base)] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-[var(--pink-600)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-sm font-bold text-[var(--pink-600)]">{item.docNo}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                    {saleStatus && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${saleStatus.color}`}>{saleStatus.label}</span>}
                    {depositStatus && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${depositStatus.color}`}>{depositStatus.label}</span>}
                    {payStatus && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${payStatus.color}`}>{payStatus.label}</span>}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {item.customerName} · {formatDate(item.createdAt)}{item.branchName ? ` · สาขา ${item.branchName}` : ''}
                  </p>
                </div>
                <p className={`font-semibold text-sm hidden sm:block shrink-0 ${
                  isCancelled
                    ? 'text-red-500 line-through decoration-red-400 decoration-2'
                    : 'text-[var(--text-primary)]'
                }`}>
                  {formatCurrency(item.amount)}
                </p>
                <div className="flex gap-1.5 shrink-0">
                  {item.sale ? (
                    <button onClick={() => openSale(item.sale!)}
                      className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all" title="ดูบิล">
                      <Eye className="w-4 h-4" />
                    </button>
                  ) : (
                    <Link href={item.sourceType === 'work_order' ? '/production' : '/deposits'}
                      className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-all" title="ดูรายละเอียด">
                      <Eye className="w-4 h-4" />
                    </Link>
                  )}
                  {item.sale && (
                    <button onClick={() => printSale(item.sale!)}
                      className="p-2 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-blue-600 transition-all" title="พิมพ์">
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                  {item.deposit && <CancelFinancialDocument target={{ kind: 'deposit', record: item.deposit }} />}
                  <button disabled
                    className="p-2 rounded-lg text-[var(--text-muted)] opacity-40" title="ดาวน์โหลด PDF (กำลังเตรียม)">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--border-light)] flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[var(--text-primary)]">ใบเสร็จ {activeSale.receiptNo}</h3>
                <p className="text-xs text-[var(--text-muted)]">{formatDate(activeSale.createdAt)}</p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="p-2 rounded-xl hover:bg-[var(--bg-base)] text-[var(--text-muted)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">
              {message && (
                <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                  {message}
                </div>
              )}

              <div className="grid md:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[var(--bg-base)] border border-[var(--border-light)] p-4">
                  <p className="text-xs text-[var(--text-muted)]">ยอดสุทธิ</p>
                  <p className={`text-xl font-bold ${activeSale.status === 'cancelled' ? 'text-red-500 line-through decoration-red-400 decoration-2' : 'text-[var(--pink-600)]'}`}>
                    {formatCurrency(activeSale.totalAmount)}
                  </p>
                  {activeSale.status === 'cancelled' && (
                    <p className="mt-1 text-[11px] font-medium text-red-600">ไม่ถูกนับเป็นยอดขาย</p>
                  )}
                </div>
                <div className="rounded-2xl bg-[var(--bg-base)] border border-[var(--border-light)] p-4">
                  <p className="text-xs text-[var(--text-muted)]">สถานะบิล</p>
                  <span className={`inline-flex mt-1 text-xs px-2 py-1 rounded-full font-semibold ${saleStatusConfig[activeSale.status].color}`}>
                    {saleStatusConfig[activeSale.status].label}
                  </span>
                </div>
                <div className="rounded-2xl bg-[var(--bg-base)] border border-[var(--border-light)] p-4">
                  <p className="text-xs text-[var(--text-muted)]">ชำระเงิน</p>
                  <span className={`inline-flex mt-1 text-xs px-2 py-1 rounded-full font-semibold ${paymentCfg.color}`}>
                    {paymentCfg.label}
                  </span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Pencil className="w-4 h-4" /> ข้อมูลบิล
                  </h4>
                  <input value={editForm.customerName} onChange={e => setEditForm(v => ({ ...v, customerName: e.target.value }))}
                    placeholder="ชื่อลูกค้า"
                    className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]" />
                  <input value={editForm.customerPhone} onChange={e => setEditForm(v => ({ ...v, customerPhone: e.target.value }))}
                    placeholder="เบอร์โทรลูกค้า"
                    className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]" />
                  <textarea value={editForm.receiptNote} onChange={e => setEditForm(v => ({ ...v, receiptNote: e.target.value }))}
                    placeholder="หมายเหตุท้ายบิล เช่น รับประกัน / เงื่อนไขท้ายใบเสร็จ"
                    rows={3}
                    className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)] resize-none" />
                  <textarea value={editForm.notes} onChange={e => setEditForm(v => ({ ...v, notes: e.target.value }))}
                    placeholder="หมายเหตุบิล"
                    rows={3}
                    className="w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)] resize-none" />
                  <button onClick={saveSaleText} disabled={saving || activeSale.status === 'cancelled'} title={canEditBill ? 'บันทึกข้อมูลบิล' : 'ต้องขอสิทธิ์แก้ไขบิลย้อนหลัง'}
                    className="px-4 py-2 rounded-xl bg-[var(--pink-600)] text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />} บันทึกข้อมูลบิล
                  </button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> การชำระเงิน
                  </h4>
                  <div className="rounded-2xl border border-[var(--border-light)] p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-[var(--text-muted)]">วิธีชำระ</span><span className="font-semibold">{paymentLabels[firstPayment?.method ?? 'cash']}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--text-muted)]">ยอดรับ</span><span className="font-semibold">{formatCurrency(firstPayment?.amount ?? activeSale.paidAmount ?? 0)}</span></div>
                    {firstPayment?.slipUrl ? (
                      <a href={firstPayment.slipUrl} target="_blank" className="block text-xs text-[var(--pink-600)] underline">เปิดดูสลิปที่แนบไว้</a>
                    ) : (
                      <p className="text-xs text-amber-600">ยังไม่มีสลิป สามารถแนบย้อนหลังได้</p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <label title={canAttachSlip ? 'แนบหรือเปลี่ยนสลิป' : 'ต้องขอสิทธิ์แนบ/เปลี่ยนสลิปย้อนหลัง'} className="flex-1 cursor-pointer px-4 py-2 rounded-xl border border-dashed border-[var(--border-light)] text-sm text-center text-[var(--text-secondary)] hover:bg-[var(--pink-50)]">
                      {uploading ? 'กำลังอัปโหลด...' : 'แนบ/เปลี่ยนสลิป'}
                      <input type="file" accept="image/*" className="hidden" onChange={e => uploadSlip(e.target.files?.[0])} />
                    </label>
                    <button onClick={confirmPayment} disabled={saving || activeSale.status === 'cancelled'} title={canConfirmPayment ? 'ยืนยันชำระเงิน' : 'ต้องขอสิทธิ์ยืนยันการชำระเงิน'}
                      className="flex-1 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} ยืนยันชำระ
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border-light)] overflow-hidden">
                <div className="grid grid-cols-[1fr_64px_96px] gap-2 px-4 py-2 text-xs font-semibold text-[var(--text-muted)] bg-[var(--bg-base)]">
                  <span>รายการ</span><span className="text-center">จำนวน</span><span className="text-right">รวม</span>
                </div>
                {activeSale.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="grid grid-cols-[1fr_64px_96px] gap-2 px-4 py-3 text-sm border-t border-[var(--border-light)]">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{formatCurrency(item.unitPrice)}</p>
                      {(activeSale.showVatOnReceipt ?? ((activeSale.taxAmount ?? 0) > 0)) && item.taxType === 'non_vat' && <p className="text-[11px] text-amber-600">ไม่นับ VAT</p>}
                      {item.note && <p className="text-[11px] text-purple-700 whitespace-pre-wrap break-words">หมายเหตุ: {item.note}</p>}
                    </div>
                    <span className="text-center">{item.quantity}</span>
                    <span className="text-right font-semibold">{formatCurrency(item.total)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <CancelFinancialDocument target={{ kind: 'sale', record: activeSale }} />
                {activeSale.cancelReason && <p className="mt-2 text-xs text-red-600">{activeSale.cancelReason}</p>}
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border-light)] flex gap-3">
              <button onClick={() => printSale(activeSale)}
                className="flex-1 py-2.5 rounded-2xl border border-[var(--border-light)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)] flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> พิมพ์ใบเสร็จ
              </button>
              <button onClick={() => setSelectedSale(null)}
                className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-sm font-bold text-white">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
