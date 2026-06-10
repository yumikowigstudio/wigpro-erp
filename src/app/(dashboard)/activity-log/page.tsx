'use client'
import { useState } from 'react'
import { formatDateTime } from '@/lib/utils'
import { Search, Filter, BookOpen, User, ShoppingCart, Edit, Trash2, LogIn, LogOut } from 'lucide-react'

const actionIcons: Record<string, { icon: React.ElementType; color: string }> = {
  login: { icon: LogIn, color: 'bg-emerald-100 text-emerald-600' },
  logout: { icon: LogOut, color: 'bg-gray-100 text-gray-600' },
  create: { icon: User, color: 'bg-blue-100 text-blue-600' },
  update: { icon: Edit, color: 'bg-amber-100 text-amber-600' },
  delete: { icon: Trash2, color: 'bg-red-100 text-red-600' },
  sale: { icon: ShoppingCart, color: 'bg-purple-100 text-purple-600' },
}

const mockLogs = [
  { id: '1', user: 'น้องนิ', action: 'sale', module: 'POS', description: 'บันทึกการขาย RCP-01240604-0012 ยอด ฿45,000', ip: '192.168.1.10', device: 'Chrome/Windows', createdAt: new Date('2024-06-04T10:35:00') },
  { id: '2', user: 'พี่แอน', action: 'create', module: 'ลูกค้า', description: 'เพิ่มลูกค้าใหม่: คุณรัตนา ดีเสมอ (CUS-000025)', ip: '192.168.1.15', device: 'Safari/iPhone', createdAt: new Date('2024-06-04T10:20:00') },
  { id: '3', user: 'น้องนิ', action: 'update', module: 'งานผลิต', description: 'เปลี่ยนสถานะออเดอร์ 0105240001 จาก "รอผลิต" เป็น "กำลังผลิต"', ip: '192.168.1.10', device: 'Chrome/Windows', createdAt: new Date('2024-06-04T09:45:00') },
  { id: '4', user: 'คุณสมศักดิ์', action: 'login', module: 'ระบบ', description: 'เข้าสู่ระบบสำเร็จ', ip: '192.168.1.22', device: 'Chrome/Mac', createdAt: new Date('2024-06-04T09:00:00') },
  { id: '5', user: 'พี่แอน', action: 'update', module: 'สต๊อก', description: 'รับสินค้าเข้า WIG-002 จำนวน 5 ชิ้น', ip: '192.168.1.15', device: 'Safari/iPhone', createdAt: new Date('2024-06-03T16:30:00') },
  { id: '6', user: 'น้องนิ', action: 'create', module: 'นัดหมาย', description: 'สร้างนัดหมายใหม่ให้คุณมาลี สวยงาม วันที่ 5 มิ.ย.', ip: '192.168.1.10', device: 'Chrome/Windows', createdAt: new Date('2024-06-03T15:00:00') },
]

export default function ActivityLogPage() {
  const [search, setSearch] = useState('')
  const [filterModule, setFilterModule] = useState('')
  const [filterAction, setFilterAction] = useState('')

  const filtered = mockLogs.filter((log) => {
    const q = search.toLowerCase()
    const matchSearch = !q || [log.user, log.description, log.module].some((v) => v.toLowerCase().includes(q))
    const matchModule = !filterModule || log.module === filterModule
    const matchAction = !filterAction || log.action === filterAction
    return matchSearch && matchModule && matchAction
  })

  const modules = Array.from(new Set(mockLogs.map((l) => l.module)))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#f5ede3] flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-[var(--pink-600)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">บันทึกกิจกรรม</h1>
          <p className="text-sm text-[var(--text-muted)]">ประวัติการใช้งานระบบทั้งหมด</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหากิจกรรม ผู้ใช้งาน..." className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none" />
        </div>
        <select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none">
          <option value="">ทุก Module</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none">
          <option value="">ทุกการกระทำ</option>
          <option value="login">Login</option>
          <option value="create">เพิ่มข้อมูล</option>
          <option value="update">แก้ไขข้อมูล</option>
          <option value="delete">ลบข้อมูล</option>
          <option value="sale">ขาย</option>
        </select>
      </div>

      {/* Log timeline */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] divide-y divide-[var(--border-light)]">
        {filtered.map((log) => {
          const info = actionIcons[log.action] || { icon: BookOpen, color: 'bg-gray-100 text-gray-600' }
          return (
            <div key={log.id} className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--bg-subtle)] transition-colors">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${info.color}`}>
                <info.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)]">{log.description}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-secondary)]">{log.user}</span>
                  <span>·</span>
                  <span>{log.module}</span>
                  <span>·</span>
                  <span>{log.ip}</span>
                  <span>·</span>
                  <span>{log.device}</span>
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)] shrink-0">{formatDateTime(log.createdAt)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
