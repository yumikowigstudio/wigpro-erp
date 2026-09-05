'use client'
import { useEffect, useState } from 'react'
import { Pause, RotateCcw, Trash2, X } from 'lucide-react'

type Draft<T> = { id: string; name: string; savedAt: string; value: T }
export function PosDrafts<T>({ storageKey, value, itemCount, customerName, disabled, onRestore, onClear }: {
  storageKey: string; value: T; itemCount: number; customerName: string; disabled: boolean;
  onRestore: (value: T) => void; onClear: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft<T>[]>([])
  const [recovery, setRecovery] = useState<Draft<T> | null>(null)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      setDrafts(Array.isArray(saved.drafts) ? saved.drafts : [])
      setRecovery(saved.active ?? null)
    } catch { setError('อ่านบิลที่พักไว้ไม่สำเร็จ') }
    setReady(true)
  }, [storageKey])
  useEffect(() => {
    if (!ready || recovery) return
    const timer = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ drafts, active: itemCount ? { id: 'active', name: customerName || 'ลูกค้าทั่วไป', savedAt: new Date().toISOString(), value } : null })) }
      catch { setError('พื้นที่จัดเก็บเต็ม บิลนี้ยังไม่ได้สำรองในเครื่อง') }
    }, 250)
    return () => clearTimeout(timer)
  }, [ready, recovery, value, drafts, itemCount, customerName, storageKey])
  const write = (next: Draft<T>[], active: Draft<T> | null = null) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ drafts: next, active })); setDrafts(next); setError(''); return true }
    catch { setError('พักบิลไม่สำเร็จ กรุณาตรวจพื้นที่จัดเก็บในเครื่อง'); return false }
  }
  const park = () => {
    if (!itemCount || disabled || recovery) return
    if (drafts.length >= 10) { setError('พักไว้ครบ 10 บิลแล้ว กรุณาเรียกคืนหรือลบบิลเดิมก่อน'); return }
    if (write([...drafts, { id: crypto.randomUUID(), name: customerName || 'ลูกค้าทั่วไป', savedAt: new Date().toISOString(), value }])) onClear()
  }
  const restore = (draft: Draft<T>) => {
    if (itemCount && !window.confirm('แทนที่ตะกร้าปัจจุบันด้วยบิลนี้?')) return
    if (write(drafts.filter(item => item.id !== draft.id), draft)) {
      onRestore(draft.value); setRecovery(null); setOpen(false)
    }
  }
  return <div className="space-y-2 border-b border-[var(--border-light)] px-4 py-2">
    <div className="flex items-center gap-2">
      <button type="button" disabled={disabled || !itemCount || !!recovery} onClick={park} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40"><Pause className="h-3.5 w-3.5" />พักบิล</button>
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />บิลที่พัก ({drafts.length})</button>
    </div>
    {recovery && <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg"><span>มีตะกร้าที่ยังไม่เสร็จ: {recovery.name}</span><button disabled={disabled} onClick={() => restore(recovery)} className="underline font-semibold">เรียกคืน</button><button aria-label="ทิ้งตะกร้าที่กู้คืน" disabled={disabled} onClick={() => { if (window.confirm('ทิ้งตะกร้าที่ค้างไว้?') && write(drafts)) setRecovery(null) }}><X className="h-4 w-4" /></button></div>}
    {open && <div className="max-h-48 overflow-y-auto divide-y">
      {!drafts.length && <p className="py-3 text-xs text-[var(--text-muted)]">ไม่มีบิลที่พักไว้ในเครื่องนี้</p>}
      {drafts.map(draft => <div key={draft.id} className="flex items-center gap-2 py-2"><button disabled={disabled} onClick={() => restore(draft)} className="flex-1 text-left min-w-0"><span className="block text-xs font-semibold truncate">{draft.name}</span><span className="text-[10px] text-[var(--text-muted)]">{new Date(draft.savedAt).toLocaleString('th-TH')}</span></button><button disabled={disabled} title="ลบบิลที่พัก" aria-label="ลบบิลที่พัก" onClick={() => { if (window.confirm(`ลบบิลที่พักของ ${draft.name}?`)) write(drafts.filter(item => item.id !== draft.id), recovery) }} className="p-2 text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}
    </div>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>
}
