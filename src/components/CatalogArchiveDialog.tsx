'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { archiveCatalogItems, CATALOG_ARCHIVE_LIMIT } from '@/lib/catalogArchive'
import type { CatalogScopedItem } from '@/lib/catalogScope'

export type CatalogArchiveTarget = CatalogScopedItem & { id: string; name: string }
export function CatalogArchiveDialog({ kind, items, originBranchId, onClose, onSaved }: {
  kind: 'products' | 'services'; items: CatalogArchiveTarget[]; originBranchId: string
  onClose: () => void; onSaved: () => void
}) {
  const { companyId, branchId, userId, userName, branches } = useAuth()
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [operationId] = useState(() => crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)
  const shared = items.filter(item => item.catalogScope === 'shared' || !item.branchId || item.branchId === 'main').length
  const noun = kind === 'products' ? 'สินค้า' : 'บริการ'
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    formRef.current?.focus()
    return () => previous?.focus()
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || !acknowledged) return
    if (branchId !== originBranchId) { setError('สาขาเปลี่ยนแล้ว กรุณาปิดหน้าต่างและเลือกรายการใหม่'); return }
    setSaving(true); setError('')
    try {
      await archiveCatalogItems({ operationId, companyId, branchId, userId, userName, kind, ids: items.map(item => item.id), reason })
      onSaved()
    } catch (error) { setError(error instanceof Error ? error.message : 'ลบไม่สำเร็จ กรุณาลองใหม่') }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
    <form ref={formRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`ลบ${noun}ที่เลือก`} onSubmit={submit}
      onKeyDown={event => {
        if (event.key === 'Escape' && !saving) onClose()
        if (event.key === 'Tab') {
          const controls = Array.from(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') ?? [])
          const first = controls[0]; const last = controls.at(-1)
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }} className="w-full max-w-xl max-h-[90dvh] overflow-auto rounded-lg bg-white shadow-xl p-5 space-y-4 outline-none">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-lg">ลบ{noun} {items.length} รายการ</h2><button type="button" aria-label="ปิดหน้าต่างลบ" title="ปิด" disabled={saving} onClick={onClose}><X className="w-5 h-5" /></button></div>
      <p className="text-sm">สาขา {branches.find(branch => branch.id === originBranchId)?.name || originBranchId}</p>
      <div className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 space-y-1">
        {shared > 0 && <p>รายการกลาง {shared} รายการจะหายจากหน้าขายของทุกสาขา</p>}
        {items.length > shared && <p>รายการเฉพาะสาขา {items.length - shared} รายการจะถูกลบจากสาขานี้</p>}
        <p>เก็บประวัติบิล มัดจำ ลูกค้า อัลบั้ม สต๊อก และสิทธิ์คอร์สเดิมไว้</p>
      </div>
      <ul className="max-h-52 overflow-auto divide-y divide-gray-100 border-y border-gray-200 text-sm">{items.map(item => <li key={item.id} className="py-2 break-words">{item.name}</li>)}</ul>
      <label className="block text-sm">เหตุผลที่ลบ<textarea required disabled={saving} maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2.5" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} disabled={saving} onChange={event => setAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-red-600" /><span>ตรวจสอบรายการและสาขาที่ได้รับผลแล้ว</span></label>
      {items.length > CATALOG_ARCHIVE_LIMIT && <p role="alert" className="text-sm text-red-700">ลบได้ครั้งละไม่เกิน {CATALOG_ARCHIVE_LIMIT} รายการ กรุณาแบ่งเลือก</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">ยกเลิก</button><button disabled={saving || !acknowledged || !reason.trim() || items.length > CATALOG_ARCHIVE_LIMIT} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}ยืนยันลบ {items.length} รายการ</button></div>
    </form>
  </div>
}
