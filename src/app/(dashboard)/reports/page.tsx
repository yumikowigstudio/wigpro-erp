'use client'
import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, Download, TrendingUp, Users, Package, Factory, Star, Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { collection, onSnapshot, query, where, orderBy, Timestamp, getCountFromServer } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Sale, Customer, WorkOrder } from '@/types'

const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const reportTabs = [
  { id: 'sales',      label: 'ยอดขาย',    icon: TrendingUp },
  { id: 'customers',  label: 'ลูกค้า',     icon: Users      },
  { id: 'products',   label: 'สินค้า',     icon: Package    },
  { id: 'production', label: 'งานผลิต',   icon: Factory    },
  { id: 'commission', label: 'คอมมิชชั่น', icon: Star       },
]

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('sales')
  const [period, setPeriod]       = useState('month')
  const [loading, setLoading]     = useState(true)

  const [sales, setSales]               = useState<Sale[]>([])
  const [allSales6m, setAllSales6m]     = useState<Sale[]>([])
  const [customers, setCustomers]       = useState<Customer[]>([])
  const [workOrders, setWorkOrders]     = useState<WorkOrder[]>([])
  const [newCustCount, setNewCustCount] = useState(0)

  useEffect(() => {
    const now   = new Date()
    const start = period === 'day'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : period === 'week'
      ? new Date(now.getTime() - 7 * 86400000)
      : period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), 0, 1)

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    setLoading(true)
    let done = 0
    const check = () => { done++; if (done >= 4) setLoading(false) }

    const u1 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('createdAt', '>=', Timestamp.fromDate(start)), orderBy('createdAt','desc')),
      snap => { setSales(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]); check() },
      () => check()
    )
    const u2 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('createdAt', '>=', Timestamp.fromDate(sixMonthsAgo)), orderBy('createdAt','desc')),
      snap => { setAllSales6m(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]); check() },
      () => check()
    )
    const u3 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMERS), where('status', '!=', 'deleted'), orderBy('status'), orderBy('createdAt','desc')),
      snap => { setCustomers(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Customer[]); check() },
      () => check()
    )
    const u4 = onSnapshot(
      query(collection(db, COLLECTIONS.WORK_ORDERS), where('status', 'not-in', ['delivered','cancelled']), orderBy('status')),
      snap => { setWorkOrders(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as WorkOrder[]); check() },
      () => check()
    )

    // New customers this period
    getCountFromServer(query(collection(db, COLLECTIONS.CUSTOMERS), where('createdAt', '>=', Timestamp.fromDate(start))))
      .then(r => setNewCustCount(r.data().count))
      .catch(() => {})

    return () => { u1(); u2(); u3(); u4() }
  }, [period])

  const totalRevenue = sales.reduce((a, s) => a + s.totalAmount, 0)

  // 6-month chart
  const now = new Date()
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = (now.getMonth() - 5 + i + 12) % 12
    const y = now.getFullYear() - (now.getMonth() - 5 + i < 0 ? 1 : 0)
    const revenue = allSales6m
      .filter(s => { const d = new Date(s.createdAt); return d.getMonth() === m && d.getFullYear() === y })
      .reduce((a, s) => a + s.totalAmount, 0)
    return { name: monthNames[m], revenue }
  })

  // Top products from sale items
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  sales.forEach(s => s.items?.forEach(item => {
    const key = item.name
    const existing = productMap.get(key) ?? { name: key, qty: 0, revenue: 0 }
    productMap.set(key, {
      name: key,
      qty: existing.qty + (item.quantity ?? 1),
      revenue: existing.revenue + item.total,
    })
  }))
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // Customer level counts
  const levelCounts = { silver: 0, gold: 0, platinum: 0, vip: 0 }
  customers.forEach(c => {
    const lv = c.memberLevel as keyof typeof levelCounts
    if (lv && lv in levelCounts) levelCounts[lv]++
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">รายงาน</h1>
          <p className="text-sm text-[var(--text-muted)]">ข้อมูลเชิงธุรกิจแบบ Real-time</p>
        </div>
        <div className="flex gap-2">
          <select value={period} onChange={e => { setPeriod(e.target.value) }}
            className="px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
            <option value="day">วันนี้</option>
            <option value="week">สัปดาห์นี้</option>
            <option value="month">เดือนนี้</option>
            <option value="year">ปีนี้</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm hover:bg-[var(--bg-base)] transition-all">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'รายได้รวม',   value: formatCurrency(totalRevenue),     color: 'text-[var(--pink-500)]'  },
          { label: 'ลูกค้าใหม่',  value: String(newCustCount),              color: 'text-blue-600'           },
          { label: 'ลูกค้าทั้งหมด', value: String(customers.length),       color: 'text-emerald-600'        },
          { label: 'งานผลิตค้าง', value: String(workOrders.length),         color: 'text-purple-600'         },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-card)] p-4">
            {loading
              ? <div className="h-8 w-24 bg-[var(--bg-base)] rounded animate-pulse mb-1" />
              : <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            }
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex overflow-x-auto border-b border-[var(--border-light)]">
          {reportTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-[var(--pink-500)] text-[var(--pink-600)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
          ) : activeTab === 'sales' ? (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-4">รายได้ 6 เดือนย้อนหลัง</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f5e8f3" />
                    <XAxis dataKey="name" tick={{ fontSize:12, fill:'#a88aac' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:12, fill:'#a88aac' }} axisLine={false} tickLine={false} tickFormatter={v=>`${v/1000}K`} />
                    <Tooltip formatter={v=>[formatCurrency(Number(v)),'']} contentStyle={{ borderRadius:'12px', border:'none', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }} />
                    <Legend />
                    <Bar dataKey="revenue" name="รายได้" fill="#f472b6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {topProducts.length > 0 && (
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)] mb-4">สินค้าขายดี Top 5</h3>
                  <div className="space-y-2.5">
                    {topProducts.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-[var(--bg-base)] flex items-center justify-center text-xs font-bold text-[var(--pink-500)]">{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[var(--text-primary)] truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1.5 bg-[var(--border-light)] rounded-full">
                              <div className="h-1.5 luxury-gradient rounded-full"
                                style={{ width: `${(p.qty / (topProducts[0]?.qty || 1)) * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] shrink-0">{p.qty} ชิ้น</span>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[var(--pink-500)] shrink-0">{formatCurrency(p.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topProducts.length === 0 && (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">ยังไม่มีข้อมูลยอดขายในช่วงนี้</p>
              )}
            </div>
          ) : activeTab === 'customers' ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-[var(--text-primary)]">สถิติสมาชิก</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { level: 'silver',   label: 'Silver',   color: 'bg-gray-100 text-gray-700'    },
                  { level: 'gold',     label: 'Gold',     color: 'bg-amber-100 text-amber-700'  },
                  { level: 'platinum', label: 'Platinum', color: 'bg-blue-100 text-blue-700'    },
                  { level: 'vip',      label: 'VIP',      color: 'bg-purple-100 text-purple-700'},
                ].map(({ level, label, color }) => (
                  <div key={level} className={`rounded-xl p-4 text-center ${color}`}>
                    <p className="text-2xl font-bold">{levelCounts[level as keyof typeof levelCounts]}</p>
                    <p className="text-sm">{label}</p>
                  </div>
                ))}
              </div>
              <div className="text-sm text-[var(--text-muted)] text-center pt-2">
                ลูกค้าทั้งหมด {customers.length} ราย · มีระดับสมาชิก {customers.filter(c=>c.memberLevel).length} ราย
              </div>
            </div>
          ) : activeTab === 'production' ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-[var(--text-primary)]">งานผลิตที่ค้างอยู่ ({workOrders.length} รายการ)</h3>
              {workOrders.length === 0 ? (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">ไม่มีงานผลิตค้าง</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-light)]">
                        <th className="text-left text-xs font-semibold text-[var(--text-muted)] pb-2">ออเดอร์</th>
                        <th className="text-left text-xs font-semibold text-[var(--text-muted)] pb-2">ลูกค้า</th>
                        <th className="text-left text-xs font-semibold text-[var(--text-muted)] pb-2">สถานะ</th>
                        <th className="text-right text-xs font-semibold text-[var(--text-muted)] pb-2">ยอด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-light)]">
                      {workOrders.slice(0, 10).map(wo => (
                        <tr key={wo.id} className="hover:bg-[var(--pink-50)]/30">
                          <td className="py-2.5 font-medium">{wo.orderNo}</td>
                          <td className="py-2.5 text-[var(--text-secondary)]">{wo.customerName}</td>
                          <td className="py-2.5">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{wo.status}</span>
                          </td>
                          <td className="py-2.5 text-right font-semibold text-[var(--pink-500)]">{formatCurrency(wo.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center">
              <BarChart3 className="w-12 h-12 text-[var(--border-light)] mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">รายงาน{reportTabs.find(t=>t.id===activeTab)?.label} กำลังพัฒนา</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
