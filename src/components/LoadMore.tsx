'use client'
import { ChevronDown, Loader2 } from 'lucide-react'
export function LoadMore({ hasMore, loading, onClick, error }: { hasMore: boolean; loading: boolean; onClick: () => void; error?: string }) {
  return <div className="flex flex-col items-center gap-2 py-4">
    {error && <p role="alert" className="text-sm text-red-600">โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่</p>}
    {(hasMore || error) && <button disabled={loading} onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-light)] bg-white px-4 py-2 text-sm disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}โหลดเพิ่ม</button>}
  </div>
}
