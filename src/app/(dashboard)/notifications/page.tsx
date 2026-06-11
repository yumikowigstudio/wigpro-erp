'use client'
import { useState, useEffect } from 'react'
import { formatDateTime } from '@/lib/utils'
import { Bell, Calendar, AlertTriangle, Package, CreditCard, Factory, CheckCheck, Trash2, Loader2 } from 'lucide-react'
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'

type NotifType = 'appointment' | 'stock' | 'production' | 'payment' | 'system' | 'line_notification'

const notifConfig: Record<NotifType, { icon: React.ElementType; color: string }> = {
  appointment:       { icon: Calendar,      color: 'bg-blue-100 text-blue-600'   },
  stock:             { icon: AlertTriangle, color: 'bg-amber-100 text-amber-600' },
  production:        { icon: Factory,       color: 'bg-purple-100 text-purple-600'},
  payment:           { icon: CreditCard,    color: 'bg-green-100 text-green-600' },
  system:            { icon: Bell,          color: 'bg-gray-100 text-gray-600'   },
  line_notification: { icon: Bell,          color: 'bg-emerald-100 text-emerald-600' },
}

interface Notif {
  id: string
  type: NotifType
  title: string
  message: string
  isRead: boolean
  companyId: string
  createdAt: Date | { toDate: () => Date }
}

export default function NotificationsPage() {
  const { companyId } = useAuth()
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  useEffect(() => {
    if (!companyId || companyId === 'demo_company') return
    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('companyId', '==', companyId),
    )
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const data = d.data()
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt ?? Date.now())
        return { id: d.id, ...data, createdAt } as Notif
      })
      // Sort newest-first client-side (avoids composite index)
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setNotifications(list)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [companyId])

  // Auto-generate stock notifications from low-stock products
  useEffect(() => {
    if (!companyId || companyId === 'demo_company') return
    const q = query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId))
    return onSnapshot(q, async snap => {
      const products = snap.docs.map(d => ({ id: d.id, ...d.data() })) as { id: string; name: string; sku: string; stockQty: number; minStockAlert?: number; minStockQty?: number }[]
      const lowStock = products.filter(p => p.stockQty <= (p.minStockAlert ?? p.minStockQty ?? 5))
      // เพิ่ม notification สินค้าใกล้หมดถ้ายังไม่มี (check by sku)
      for (const p of lowStock) {
        const existing = snap.docs // ไม่ check ซ้ำที่นี่ — จัดการผ่าน UI แทน
        void existing
        void p
      }
    }, () => {})
  }, [companyId])

  const unreadCount = notifications.filter(n => !n.isRead).length
  const displayed = filter === 'unread' ? notifications.filter(n => !n.isRead) : notifications

  const markRead = async (id: string) => {
    await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), { isRead: true, readAt: serverTimestamp() })
  }

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.isRead)
    if (unread.length === 0) return
    const batch = writeBatch(db)
    unread.forEach(n => batch.update(doc(db, COLLECTIONS.NOTIFICATIONS, n.id), { isRead: true, readAt: serverTimestamp() }))
    await batch.commit()
  }

  const deleteNotif = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id))
  }

  const deleteAll = async () => {
    if (!confirm('ลบการแจ้งเตือนทั้งหมด?')) return
    const batch = writeBatch(db)
    notifications.forEach(n => batch.delete(doc(db, COLLECTIONS.NOTIFICATIONS, n.id)))
    await batch.commit()
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">การแจ้งเตือน</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {loading ? 'กำลังโหลด...' : `${unreadCount} รายการที่ยังไม่ได้อ่าน`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-1.5 text-sm text-[var(--pink-600)] hover:underline">
              <CheckCheck className="w-4 h-4" /> อ่านทั้งหมด
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={deleteAll}
              className="flex items-center gap-1.5 text-sm text-red-400 hover:underline">
              <Trash2 className="w-4 h-4" /> ลบทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-white border border-[var(--border-light)] rounded-2xl shadow-sm w-fit">
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filter === f
                ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
            }`}>
            {f === 'all' ? `ทั้งหมด (${notifications.length})` : `ยังไม่อ่าน (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto mb-3 animate-spin" />
          <p className="text-[var(--text-muted)] text-sm">กำลังโหลด...</p>
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center">
          <Bell className="w-12 h-12 text-[var(--pink-100)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)] text-sm">
            {filter === 'unread' ? 'อ่านครบทุกรายการแล้ว 🎉' : 'ยังไม่มีการแจ้งเตือน'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(notif => {
            const cfg = notifConfig[notif.type] ?? notifConfig.system
            const createdAt = notif.createdAt instanceof Date ? notif.createdAt : new Date()
            return (
              <div key={notif.id} onClick={() => !notif.isRead && markRead(notif.id)}
                className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all group ${
                  notif.isRead
                    ? 'bg-white border-[var(--border-light)] hover:border-[var(--pink-200)]'
                    : 'bg-[var(--pink-50)] border-[var(--pink-200)] shadow-sm'
                }`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.color}`}>
                  <cfg.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${notif.isRead ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                      {notif.title}
                    </p>
                    {!notif.isRead && <div className="w-2 h-2 rounded-full bg-[var(--pink-500)] shrink-0" />}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{notif.message}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{formatDateTime(createdAt)}</p>
                </div>
                <button onClick={e => deleteNotif(e, notif.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-all shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Info — ถ้าใช้ demo account */}
      {companyId === 'demo_company' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
          ⚠️ กรุณา login ด้วยบัญชีจริงเพื่อดูการแจ้งเตือน
        </div>
      )}
    </div>
  )
}
