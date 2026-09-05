'use client'
import { useRef, useState } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { cancellationContext, cancelDocument, recordCancellationRefund, type CancelTarget } from '@/lib/cancellation'
import { depositPaid, saleCashReceived } from '@/lib/money'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { formatCurrency } from '@/lib/utils'

export function CancelFinancialDocument({ target }: { target: CancelTarget }) {
  const { userId, userName } = useAuth()
  const { ensurePermission } = usePermissionAction()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelProduction, setCancelProduction] = useState(false)
  const [orderCount, setOrderCount] = useState(0)
  const [depositCount, setDepositCount] = useState(0)
  const [message, setMessage] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const refundId = useRef('')
  const cancelled = target.record.status === 'cancelled'
  const refundDue = target.record.refundDue ?? 0
  const show = async () => {
    if (!await ensurePermission('action.sales.cancelBill', 'จัดการยกเลิกและคืนเงิน')) return
    setBusy(true); setMessage(''); setOpen(true)
    try {
      const context = await cancellationContext(target)
      setOrderCount(context.orders.filter(order => order.status !== 'cancelled').length)
      setDepositCount(context.deposits.length)
      setRefundAmount(String(refundDue))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'โหลดรายการไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  const submit = async () => {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      if (cancelled) {
        refundId.current ||= crypto.randomUUID()
        await recordCancellationRefund(target, { id: refundId.current, amount: Number(refundAmount), method, userId, userName })
        refundId.current = ''
      } else await cancelDocument(target, { reason, cancelProduction, userId, userName })
      setOpen(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  if (cancelled && refundDue <= 0) return <span className="text-xs text-red-600">ยกเลิกแล้ว</span>
  return <>
    <button type="button" onClick={show} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
      <XCircle className="h-4 w-4" />{cancelled ? `รอคืน ${formatCurrency(refundDue)}` : 'ยกเลิกรายการ'}
    </button>
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="ยกเลิกและคืนเงิน">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 space-y-4 shadow-xl">
        <h3 className="font-bold">{cancelled ? 'บันทึกคืนเงินจริง' : 'ตรวจผลกระทบก่อนยกเลิก'}</h3>
        <p className="text-sm">{target.kind === 'sale' ? target.record.receiptNo : target.record.depositNo} · {target.record.customerName || 'ลูกค้าทั่วไป'}</p>
        {cancelled ? <>
          <label className="block text-sm">ยอดคืน<input type="number" min="0.01" max={refundDue} step="0.01" value={refundAmount} onChange={event => setRefundAmount(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
          <label className="block text-sm">วิธีคืนเงิน<select value={method} onChange={event => setMethod(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="cash">เงินสด</option><option value="transfer">โอนเงิน</option><option value="credit_card">บัตรเครดิต</option></select></label>
        </> : <>
          <div className="border-y py-3 text-sm space-y-2">
            <p>งานผลิตที่เกี่ยวข้อง {orderCount} รายการ</p>
            {depositCount > 0 && <p>คืนสิทธิ์มัดจำ {depositCount} ใบ เพื่อใช้ปิดบิลใหม่</p>}
            <p>รับเงินไว้ {formatCurrency(target.kind === 'sale' ? saleCashReceived(target.record) : depositPaid(target.record))}</p>
            <p className="text-[var(--text-muted)]">ยอดคืนจะหักรายการที่เคยคืนแล้ว และแยกเป็นยอดรอคืนจนกว่าจะบันทึกคืนเงินจริง</p>
          </div>
          {orderCount > 0 && <label className="block text-sm">งานผลิต<select value={cancelProduction ? 'cancel' : 'keep'} onChange={event => setCancelProduction(event.target.value === 'cancel')} className="mt-1 w-full rounded-lg border p-2"><option value="keep">คงงานผลิตไว้</option><option value="cancel">ยกเลิกงานผลิตที่เกี่ยวข้อง</option></select></label>}
          <label className="block text-sm">เหตุผล<textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
        </>}
        {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
        <div className="flex justify-end gap-2">
          <button disabled={busy} onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">กลับ</button>
          <button disabled={busy || (!cancelled && !reason.trim())} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{cancelled ? 'ยืนยันคืนเงินแล้ว' : 'ยืนยันยกเลิก'}</button>
        </div>
      </div>
    </div>}
  </>
}
