'use client'
import { useState } from 'react'
import { formatDateTime } from '@/lib/utils'
import { Bell, Calendar, AlertTriangle, Package, CreditCard, Factory, CheckCheck, Trash2 } from 'lucide-react'

type NotifType = 'appointment' | 'stock' | 'production' | 'payment' | 'system'

const notifConfig: Record<NotifType, { icon: React.ElementType; color: string }> = {
  appointment: { icon: Calendar, color: 'bg-blue-100 text-blue-600' },
  stock: { icon: AlertTriangle, color: 'bg-amber-100 text-amber-600' },
  production: { icon: Factory, color: 'bg-purple-100 text-purple-600' },
  payment: { icon: CreditCard, color: 'bg-green-100 text-green-600' },
  system: { icon: Bell, color: 'bg-gray-100 text-gray-600' },
}

const mockNotifications = [
  { id: '1', type: 'appointment', title: 'นัดหมายใกล้ถึง', message: 'คุณสมใจ รักดี นัดหมาย 10:00 น. วันนี้', isRead: false, createdAt: new Date('2024-06-04T09:30:00') },
  { id: '2', type: 'production', title: 'งานผลิตใกล้กำหนดส่ง', message: 'ออเดอร์ 0105240003 กำหนดส่งวันนี้ ยังไม่พร้อมส่ง', isRead: false, createdAt: new Date('2024-06-04T08:00:00') },
  { id: '3', type: 'stock', title: 'สินค้าใกล้หมด', message: 'ชุดดูแลวิกพรีเมียม (ACC-002) เหลือ 1 ชิ้น (ต่ำกว่า min: 3)', isRead: false, createdAt: new Date('2024-06-04T07:00:00') },
  { id: '4', type: 'payment', title: 'รับชำระเงิน', message: 'คุณมาลี ชำระครบ ฿28,000 สำหรับออเดอร์ 0105240002', isRead: true, createdAt: new Date('2024-06-03T16:45:00') },
  { id: '5', type: 'production', title: 'งานผลิตถึงสาขา', message: 'ออเดอร์ 0105240001 ถึงสาขาสุขุมวิทแล้ว รอนัดลูกค้ารับสินค้า', isRead: true, createdAt: new Date('2024-06-03T14:00:00') },
  { id: '6', type: 'appointment', title: 'ยืนยันนัดหมาย', message: 'คุณวิไล เก่งมาก ยืนยันนัดหมาย 14:30 น. ผ่าน LINE', isRead: true, createdAt: new Date('2024-06-03T10:00:00') },
]

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(mockNotifications)

  const unreadCount = notifications.filter((n) => !n.isRead).length

  const markAllRead = () => setNotifications(notifications.map((n) => ({ ...n, isRead: true })))
  const markRead = (id: string) => setNotifications(notifications.map((n) => n.id === id ? { ...n, isRead: true } : n))

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">การแจ้งเตือน</h1>
          <p className="text-sm text-[var(--text-muted)]">{unreadCount} รายการที่ยังไม่ได้อ่าน</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-[var(--pink-600)] hover:underline">
            <CheckCheck className="w-4 h-4" /> อ่านทั้งหมด
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.map((notif) => {
          const cfg = notifConfig[notif.type as NotifType]
          return (
            <div
              key={notif.id}
              onClick={() => markRead(notif.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${
                notif.isRead
                  ? 'bg-white border-[var(--border-light)]'
                  : 'bg-[#fdf6ec] border-[#c9963a]/30'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.color}`}>
                <cfg.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${notif.isRead ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                    {notif.title}
                  </p>
                  {!notif.isRead && <div className="w-2 h-2 rounded-full bg-[#8B4513] shrink-0" />}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{notif.message}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">{formatDateTime(notif.createdAt)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
