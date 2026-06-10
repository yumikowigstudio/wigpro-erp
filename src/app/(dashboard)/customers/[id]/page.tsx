'use client'
import { useState, use, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, MessageCircle, Calendar, Star, Edit,
  Plus, ShoppingCart, Factory, CreditCard, MapPin, Gift, Loader2
} from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'
import { getDocument } from '@/lib/firestore'
import { COLLECTIONS } from '@/lib/firestore'
import { Customer } from '@/types'

const levelConfig: Record<string, { label: string; color: string }> = {
  silver:   { label: 'Silver',   color: 'bg-gray-100 text-gray-700'    },
  gold:     { label: 'Gold',     color: 'bg-amber-100 text-amber-700'  },
  platinum: { label: 'Platinum', color: 'bg-blue-100 text-blue-700'    },
  vip:      { label: 'VIP',      color: 'bg-purple-100 text-purple-700'},
}

const caseTypeLabels: Record<string, string> = {
  chemo:    'เคมีบำบัด',
  alopecia: 'ผมร่วง (Alopecia)',
  radiation:'รังสีรักษา',
  fashion:  'แฟชั่น',
  other:    'อื่นๆ',
}

const tabs = [
  { id: 'overview',  label: 'ภาพรวม'   },
  { id: 'orders',    label: 'ใบสั่งซื้อ'},
  { id: 'appointments', label: 'นัดหมาย'},
]

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getDocument<Customer>(COLLECTIONS.CUSTOMERS, id)
      .then(data => { setCustomer(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-[var(--pink-300)] animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="py-32 text-center space-y-4">
        <p className="text-[var(--text-muted)]">ไม่พบข้อมูลลูกค้า</p>
        <Link href="/customers" className="text-[var(--pink-500)] hover:underline text-sm">กลับไปรายการลูกค้า</Link>
      </div>
    )
  }

  const levelCfg = customer.memberLevel ? (levelConfig[customer.memberLevel] ?? levelConfig.silver) : null

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/customers" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
        <ArrowLeft className="w-4 h-4" /> กลับไปรายการลูกค้า
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="h-20 luxury-gradient" />
        <div className="px-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8 mb-4">
            <div className="w-16 h-16 rounded-2xl luxury-gradient border-4 border-white flex items-center justify-center text-white font-bold text-2xl shadow-lg">
              {customer.firstName.charAt(0)}
            </div>
            <div className="flex-1 pt-2 sm:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[var(--text-primary)]">
                  {customer.firstName} {customer.lastName}
                </h1>
                {levelCfg && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${levelCfg.color}`}>{levelCfg.label}</span>
                )}
              </div>
              <p className="text-sm text-[var(--text-muted)]">{customer.customerId}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {customer.phone && (
                <a href={`tel:${customer.phone}`}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-base)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--border-light)] transition-all">
                  <Phone className="w-3.5 h-3.5" /> โทร
                </a>
              )}
              {customer.lineId && (
                <a href={`https://line.me/ti/p/${customer.lineId}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-500 rounded-xl text-sm text-white hover:bg-green-600 transition-all">
                  <MessageCircle className="w-3.5 h-3.5" /> LINE
                </a>
              )}
              <Link href={`/customers/${id}/edit`}
                className="flex items-center gap-1.5 px-3 py-2 luxury-gradient rounded-xl text-sm text-white hover:opacity-90 transition-all">
                <Edit className="w-3.5 h-3.5" /> แก้ไข
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-[var(--pink-500)]">{formatCurrency(customer.totalPurchase ?? 0)}</p>
              <p className="text-xs text-[var(--text-muted)]">ยอดซื้อสะสม</p>
            </div>
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-amber-600 flex items-center justify-center gap-1">
                <Star className="w-4 h-4" /> {(customer.points ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-[var(--text-muted)]">คะแนนสะสม</p>
            </div>
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-blue-600">—</p>
              <p className="text-xs text-[var(--text-muted)]">ครั้งที่ใช้บริการ</p>
            </div>
          </div>

          {/* Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {customer.phone && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Phone className="w-4 h-4 text-[var(--text-muted)] shrink-0" /> {customer.phone}
              </div>
            )}
            {customer.lineId && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <MessageCircle className="w-4 h-4 text-green-500 shrink-0" /> {customer.lineId}
              </div>
            )}
            {customer.birthDate && (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Gift className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                {formatDate(new Date(customer.birthDate))}
              </div>
            )}
          </div>

          {/* Case types */}
          {customer.caseTypes && customer.caseTypes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {customer.caseTypes.map(ct => (
                <span key={ct} className="text-xs px-2.5 py-1 bg-pink-100 text-pink-700 rounded-full font-medium">
                  {caseTypeLabels[ct] ?? ct}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {(customer as { notes?: string }).notes && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-[var(--text-muted)]">
              📝 {(customer as { notes?: string }).notes}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex overflow-x-auto border-b border-[var(--border-light)]">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-[var(--pink-500)] text-[var(--pink-600)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-semibold text-[var(--text-primary)] text-sm">ข้อมูลการเป็นสมาชิก</h3>
                <div className="space-y-0 text-sm divide-y divide-[var(--border-light)]">
                  {[
                    { label: 'วันที่เป็นสมาชิก', value: formatDate(new Date(customer.createdAt)) },
                    { label: 'อัปเดตล่าสุด',     value: formatDate(new Date(customer.updatedAt)) },
                    { label: 'ระดับสมาชิก',      value: levelCfg?.label ?? 'ไม่ระบุ' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between py-2.5">
                      <span className="text-[var(--text-muted)]">{row.label}</span>
                      <span className="font-medium text-[var(--text-primary)]">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-[var(--text-primary)] text-sm">การดำเนินการ</h3>
                <div className="space-y-2">
                  {[
                    { label: 'สร้างนัดหมาย', icon: Calendar,     href: `/appointments`, color: 'text-blue-600 bg-blue-50'   },
                    { label: 'เปิดบิลขาย',   icon: ShoppingCart, href: `/pos`,          color: 'text-green-600 bg-green-50' },
                    { label: 'สั่งผลิตวิก',  icon: Factory,      href: `/production`,   color: 'text-purple-600 bg-purple-50'},
                    { label: 'รับมัดจำ',     icon: CreditCard,   href: `/deposits`,     color: 'text-amber-600 bg-amber-50'  },
                  ].map(action => (
                    <Link key={action.label} href={action.href}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-80 ${action.color}`}>
                      <action.icon className="w-4 h-4" /> {action.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">ยังไม่มีใบสั่งซื้อ</div>
          )}

          {activeTab === 'appointments' && (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">ยังไม่มีนัดหมาย</div>
          )}
        </div>
      </div>
    </div>
  )
}
