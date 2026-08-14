'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/hooks/useAuth'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { cn } from '@/lib/utils'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { getPagePermission } from '@/lib/permissions'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const { isAuthenticated, isLoading, user, userId, companyId, hasPermission } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user)) router.replace('/login')
  }, [isAuthenticated, isLoading, router, user])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f472b6] to-[#d946a8] flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-xl shadow-pink-200 animate-pulse">W</div>
          <p className="text-[var(--text-muted)] text-sm">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || !user) return null

  const pagePermission = getPagePermission(pathname)
  const denied = pagePermission && !hasPermission(pagePermission)

  const requestAccess = async () => {
    if (!pagePermission || requesting || requested) return
    setRequesting(true)
    try {
      await addDoc(collection(db, COLLECTIONS.PERMISSION_REQUESTS), {
        companyId,
        userId,
        userEmail: user.email,
        userName: user.displayName,
        permission: pagePermission,
        path: pathname,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setRequested(true)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile Sidebar */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative w-[230px] h-full">
            <Sidebar collapsed={false} onToggle={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className={cn(
          'transition-all duration-300',
          collapsed ? 'md:ml-[82px]' : 'md:ml-[252px]'
        )}
      >
        <Header onMenuToggle={() => setMobileSidebarOpen(true)} />
        <main className="px-5 pb-8 md:px-6 min-h-[calc(100vh-4rem)]">
          {denied ? (
            <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center">
              <div className="w-full max-w-md bg-white border border-[var(--border-light)] rounded-2xl shadow-[var(--shadow-card)] p-6 text-center">
                <p className="text-lg font-bold text-[var(--text-primary)]">ต้องขอสิทธิ์จากเจ้าของร้านก่อน</p>
                <p className="text-sm text-[var(--text-muted)] mt-2">บัญชีนี้ยังไม่ได้รับสิทธิ์เปิดหน้านี้ เจ้าของร้านสามารถเปิดให้ได้ที่ ตั้งค่า &gt; สิทธิ์การใช้งาน</p>
                <button
                  onClick={requestAccess}
                  disabled={requesting || requested}
                  className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white text-sm font-semibold disabled:opacity-50"
                >
                  {requested ? 'ส่งคำขอแล้ว' : requesting ? 'กำลังส่งคำขอ...' : 'ขออนุญาตเจ้าของร้าน'}
                </button>
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
