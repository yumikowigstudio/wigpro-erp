import type { Deposit } from '@/types'
import { depositPaid, depositPayments, depositRemaining, money } from './money'
import { formatCurrency } from './utils'
import { formatThaiReceiptDate } from './dateFormat'

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export interface DepositReceiptOptions {
  tendered?: number
  paymentId?: string
  kind?: 'deposit' | 'final'
}

const receiptOptions = (value?: number | DepositReceiptOptions): DepositReceiptOptions =>
  typeof value === 'number' ? { tendered: value } : value ?? {}

export function depositReceiptHtml(deposit: Deposit, value?: number | DepositReceiptOptions) {
  const options = receiptOptions(value)
  const shop = deposit.receiptInfo
  const history = depositPayments(deposit).filter(payment => payment.confirmed)
  const latest = history.at(-1)
  const selectedPayment = options.paymentId
    ? history.find(payment => payment.id === options.paymentId)
    : options.tendered !== undefined ? latest : undefined
  const paid = depositPaid(deposit)
  const remaining = depositRemaining(deposit)
  const thisPayment = selectedPayment?.amount ?? 0
  const selectedIndex = selectedPayment ? history.findIndex(payment => payment.id === selectedPayment.id) : -1
  const paidAtReceipt = selectedIndex >= 0
    ? money(history.slice(0, selectedIndex + 1).reduce((sum, payment) => sum + payment.amount, 0))
    : paid
  const remainingAtReceipt = selectedIndex >= 0
    ? money(deposit.totalAmount - paidAtReceipt + (deposit.appliedAmount ?? 0) + (deposit.refundedCreditAmount ?? 0))
    : remaining
  const kind = options.kind
    ?? selectedPayment?.receiptKind
    ?? (selectedPayment?.id === latest?.id && remaining <= 0 ? 'final' : 'deposit')
  const title = kind === 'final' ? 'ใบเสร็จรับเงิน / Receipt' : 'ใบรับเงินมัดจำ / Deposit Receipt'
  const receiptItems = selectedPayment?.receiptItems ?? deposit.items ?? []
  const receiptNote = selectedPayment?.receiptNote ?? deposit.receiptNote
  const row = (label: string, value: string, className = '') => `<div class="row ${className}"><span>${label}</span><strong>${value}</strong></div>`
  const date = (value?: Date) => formatThaiReceiptDate(value)
  const method: Record<string, string> = { cash: 'เงินสด / Cash', transfer: 'โอนเงิน / Transfer', qr: 'QR', credit_card: 'บัตร / Card' }
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escape(deposit.depositNo)}</title><style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box}body{font-family:'Noto Sans Thai',Tahoma,Arial,sans-serif;color:#111;font-size:13px;font-weight:500;width:72mm;max-width:100%;margin:0 auto;padding:4mm 0;line-height:1.55}
    h1{font-size:18px;font-weight:800;line-height:1.35;margin:8px 0}h2{font-size:15px;font-weight:800;line-height:1.35;border-block:1.5px solid;padding:6px 0;margin:12px 0;text-align:center}.shop{text-align:center;font-size:11.5px;font-weight:500;line-height:1.45;overflow-wrap:anywhere}.shop img{width:48px;height:48px;object-fit:contain}
    .row{display:flex;justify-content:space-between;gap:10px;padding:2.5px 0}.row>span{min-width:0;overflow-wrap:anywhere}.row strong{flex-shrink:0;font-weight:700;text-align:right}.total{font-size:16px;font-weight:800;border-top:1.5px solid;margin-top:7px;padding-top:8px}
    .item{padding:10px 0;border-bottom:1px dashed #999}.item>.row>span{font-size:13.5px;font-weight:700}.item>.row>strong{font-size:13.5px;font-weight:800}.note{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11.5px;font-weight:500;line-height:1.55;margin:4px 0}.meta{font-size:11.5px;font-weight:500;color:#333}.box{border:1px solid #333;padding:8px;margin:10px 0}.signatures{display:flex;gap:12px;margin-top:26px;text-align:center;font-size:11px}.signatures>div{flex:1;border-top:1px solid;padding-top:5px}.history{margin-top:10px;border-top:1px dashed #888}.cancelled{text-align:center;color:#b91c1c;font-weight:800}
    .box .row strong{min-width:0;max-width:65%;flex-shrink:1;overflow-wrap:anywhere}.signatures>div{min-width:0;overflow-wrap:anywhere}
    @media print{@page{size:80mm auto;margin:4mm}body{padding:0}.item{break-inside:avoid}}
  </style></head><body><header class="shop">${shop?.logoUrl ? `<img src="${escape(shop.logoUrl)}" alt="Logo">` : ''}<h1>${escape(shop?.nameTh || deposit.branchName || '')}</h1>
    <div>สาขา / Branch: ${escape(shop?.branchName || deposit.branchName || '')} ${escape(shop?.branchCode || deposit.branchCode || '')}</div><div class="note">${escape(shop?.address)}</div><div>${escape(shop?.phone)}</div>${shop?.email ? `<div>${escape(shop.email)}</div>` : ''}${shop?.taxId ? `<div>เลขผู้เสียภาษี / Tax ID: ${escape(shop.taxId)}</div>` : ''}</header>
    <h2>${title}</h2>${deposit.status === 'cancelled' ? '<p class="cancelled">ยกเลิก / Cancelled</p>' : ''}
    <div class="box">${row('เลขที่ / No.', escape(deposit.depositNo))}${row('วันที่รับเงิน / Date', date(selectedPayment?.receivedAt || latest?.receivedAt || deposit.createdAt))}${row('ลูกค้า / Customer', escape(deposit.customerName))}${row('โทร / Phone', escape(deposit.customerPhone || '-'))}${selectedPayment || latest ? row('การชำระ / Payment', escape(method[(selectedPayment || latest)!.method] || (selectedPayment || latest)!.method)) : ''}</div>
    ${receiptItems.map(item => `<div class="item">${row(escape(item.name), formatCurrency(item.total))}<div class="meta">${item.quantity} × ${formatCurrency(item.unitPrice)}</div>${item.workGroupName ? `<div class="note">ชิ้นงาน / Work: ${escape(item.workGroupName)}</div>` : ''}${item.note ? `<div class="note">หมายเหตุ / Note: ${escape(item.note)}</div>` : ''}</div>`).join('')}
    ${deposit.notes ? `<div class="note">รายละเอียด / Details: ${escape(deposit.notes)}</div>` : ''}
    ${deposit.showVatOnReceipt ? row('มูลค่าก่อน VAT / Before VAT', formatCurrency(deposit.preVatAmount ?? money(deposit.totalAmount - (deposit.taxAmount || 0)) )) + row('VAT 7% (รวมในราคา / Included)', formatCurrency(deposit.taxAmount || 0)) : ''}
    ${row('รวมทั้งสิ้น / Grand Total', formatCurrency(deposit.totalAmount), 'total')}
    ${thisPayment ? row('รับก่อนหน้านี้ / Previously Paid', formatCurrency(money(paidAtReceipt - thisPayment))) + row('รับชำระครั้งนี้ / This Payment', formatCurrency(thisPayment)) : ''}
    ${row('รับสะสม / Total Paid', formatCurrency(paidAtReceipt))}${row('ยอดคงเหลือ / Balance', formatCurrency(remainingAtReceipt), 'total')}
    ${options.tendered !== undefined && options.tendered > thisPayment ? row('เงินทอน / Change', formatCurrency(money(options.tendered - thisPayment))) : ''}
    <div class="history">${history.map(payment => row(`${date(payment.receivedAt)} · ${escape(method[payment.method] || payment.method)}`, formatCurrency(payment.amount))).join('')}</div>
    ${receiptNote || shop?.receiptFooter ? `<div class="box note">${escape([receiptNote, shop?.receiptFooter].filter(Boolean).join('\n'))}</div>` : ''}
    <div class="signatures"><div>ผู้ชำระเงิน / Payer<br>${escape(deposit.customerName)}</div><div>ผู้รับเงิน / Receiver<br>${escape(selectedPayment?.receivedByName || latest?.receivedByName || deposit.receivedByName || deposit.createdByName || '-')}</div></div>
    <script>window.onload=async()=>{await document.fonts.ready;window.print()};window.onafterprint=()=>window.close()<\/script></body></html>`
}

export function printDepositReceipt(deposit: Deposit, options?: number | DepositReceiptOptions) {
  const win = window.open('', '_blank', 'width=460,height=720')
  if (!win) throw new Error('เบราว์เซอร์ปิดกั้นหน้าพิมพ์ กรุณาอนุญาตป๊อปอัปและพิมพ์จากรายการมัดจำ')
  win.document.write(depositReceiptHtml(deposit, options))
  win.document.close()
}
