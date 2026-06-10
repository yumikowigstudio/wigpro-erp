'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import StatCard from '@/components/dashboard/StatCard'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  TrendingUp, Users, Factory, Calendar,
  AlertTriangle, Scissors, Phone, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { collection, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Appointment, Sale } from '@/types'

const productionData = [
  { name: 'รอผลิต',     value: 8,  color: '#fbbf24' },
  { name: 'กำลังผลิต', value: 12, color: '#c084fc' },
  { name: 'QC',         value: 3,  color: '#60a5fa' },
  { name: 'พร้อมส่ง',  value: 5,  color: '#4ade80' },
]

const lowStock = [
  { name: 'วิกผมสั้น สีดำ',        sku: 'WIG-001', qty: 2,  min: 5  },
  { name: 'อุปกรณ์ดูแลวิก พรีเมียม', sku: 'ACC-012', qty: 1,  min: 3  },
  { name: 'เจลกันความชื้น 200ml',  sku: 'PRD-008', qty: 3,  min: 10 },
]

const statusCfg: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'รอยืนยัน',  cls: 'badge-amber' },
  confirmed: { label: 'ยืนยันแล้ว', cls: 'badge-blue'  },
  arrived:   { label: 'มาถึงแล้ว', cls: 'badge-green'  },
}

export default function DashboardPage() {
  const { currentBranch } = useAuth()
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month')
  const [todayApts, setTodayApts]   = useState<Appointment[]>([])
  const [todaySales, setTodaySales] = useState<Sale[]>([])
  const [salesData, setSalesData]   = useState([
    { name: 'ม.ค.', sales: 0 }, { name: 'ก.พ.', sales: 0 }, { name: 'มี.ค.', sales: 0 },
    { name: 'เม.ย.', sales: 0 }, { name: 'พ.ค.', sales: 0 }, { name: 'มิ.ย.', sales: 0 },
  ])

  useEffect(() => {
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

    // Today's appointments
    const aptQ = query(
      collection(db, COLLECTIONS.APPOINTMENTS),
      where('date', '>=', Timestamp.fromDate(today)),
      where('date', '<', Timestamp.fromDate(tomorrow)),
      orderBy('date'), orderBy('startTime')
    )
    const unsubApt = onSnapshot(aptQ, snap => {
      setTodayApts(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Appointment[])
    }, () => {})

    // Today's sales
    const saleQ = query(
      collection(db, COLLECTIONS.SALES),
      where('createdAt', '>=', Timestamp.fromDate(today)),
      where('createdAt', '<', Timestamp.fromDate(tomorrow))
    )
    const unsubSale = onSnapshot(saleQ, snap => {
      const sales = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]
      setTodaySales(sales)
      // Aggregate monthly for chart
      const monthly: Record<number, number> = {}
      sales.forEach(s => {
        const m = (s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt)).getMonth()
        monthly[m] = (monthly[m] ?? 0) + s.totalAmount
      })
    }, () => {})

    return () => { unsubApt(); unsubSale() }
  }, [])

  const todaySalesTotal = todaySales.reduce((s, r) => s + r.totalAmount, 0)

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">แดชบอร์ด</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {currentBranch?.name} · {formatDate(new Date())}
          </p>
        </div>

        {/* Period pills */}
        <div className="flex gap-1 p-1 bg-white border border-[var(--border-light)] rounded-2xl shadow-sm self-start sm:self-auto">
          {(['day','week','month','year'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                period === p
                  ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
              }`}
            >
              {p === 'day' ? 'วันนี้' : p === 'week' ? 'สัปดาห์' : p === 'month' ? 'เดือนนี้' : 'ปีนี้'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="ยอดขายวันนี้"   value={formatCurrency(todaySalesTotal)} subtitle={`${todaySales.length} รายการ`} icon={TrendingUp} trend={{ value: 0, label: '' }} color="pink"   />
        <StatCard title="คิววันนี้"      value={todayApts.length}               subtitle={`${todayApts.filter(a=>a.status==='pending').length} รอยืนยัน`} icon={Calendar} trend={{ value: 0, label: '' }} color="teal"   />
        <StatCard title="งานผลิตค้าง"    value={28}                             subtitle="3 ใกล้กำหนดส่ง"  icon={Factory}                                              color="amber"  />
        <StatCard title="ลูกค้าใหม่"     value={4}                              subtitle="เดือนนี้"         icon={Users}    trend={{ value: 0, label: '' }}               color="purple" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Area chart */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">ยอดขาย 6 เดือนล่าสุด</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">รายได้รวม</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-[var(--pink-500)]">{formatCurrency(628000)}</p>
              <p className="text-xs text-emerald-500 font-medium mt-0.5">↑ 15% จากปีก่อน</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={salesData} margin={{ left: -20 }}>
              <defs>
                <linearGradient id="pinkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f472b6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f472b6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5e8f3" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a88aac' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#a88aac' }} axisLine={false} tickLine={false} tickFormatter={v => `${v/1000}K`} />
              <Tooltip
                formatter={v => [formatCurrency(Number(v)), 'ยอดขาย']}
                contentStyle={{ borderRadius: '14px', border: '1px solid #edd5e8', boxShadow: '0 8px 24px rgba(180,100,160,0.15)', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="sales" stroke="#f472b6" strokeWidth={2.5} fill="url(#pinkGrad)" dot={{ r: 4, fill: '#f472b6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Production donut */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)]">สถานะงานผลิต</h3>
            <Link href="/production" className="text-xs text-[var(--pink-400)] hover:text-[var(--pink-500)] flex items-center gap-0.5 font-medium">
              ดูทั้งหมด <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex justify-center my-1">
            <PieChart width={150} height={150}>
              <Pie data={productionData} cx={75} cy={75} innerRadius={48} outerRadius={68} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                {productionData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
            </PieChart>
          </div>

          <div className="space-y-2 mt-1">
            {productionData.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  <span className="text-xs text-[var(--text-secondary)]">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-[var(--text-primary)]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Appointments */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)]">คิววันนี้</h3>
            <Link href="/appointments" className="text-xs text-[var(--pink-400)] hover:text-[var(--pink-500)] flex items-center gap-0.5 font-medium">
              จัดการคิว <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {todayApts.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">ไม่มีนัดหมายวันนี้</div>
            ) : todayApts.slice(0,5).map(apt => {
              const s = statusCfg[apt.status] ?? { label: apt.status, cls: 'badge-blue' }
              const svcName = apt.services?.map(sv => sv.serviceName).join(', ') ?? ''
              return (
                <div key={apt.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-base)] hover:bg-[var(--pink-50)] transition-all cursor-pointer group">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-sm font-bold text-[var(--pink-500)]">{apt.startTime}</p>
                  </div>
                  <div className="w-px h-8 bg-[var(--border)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{apt.customerName}</p>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                      <span className="flex items-center gap-1"><Scissors className="w-3 h-3" />{svcName}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{apt.customerPhone}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Low stock */}
        <div className="bg-white rounded-2xl border border-[var(--border-light)] p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              สินค้าใกล้หมด
            </h3>
            <Link href="/inventory" className="text-xs text-[var(--pink-400)] hover:text-[var(--pink-500)] flex items-center gap-0.5 font-medium">
              จัดการสต๊อก <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {lowStock.map(item => (
              <div key={item.sku} className="p-3.5 rounded-xl bg-amber-50 border border-amber-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-amber-500">{item.qty}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">min: {item.min}</p>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-amber-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full"
                    style={{ width: `${Math.min((item.qty / item.min) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {[
              { label: 'SKU ทั้งหมด', value: '138', color: 'text-[var(--pink-500)]' },
              { label: 'มูลค่าสต๊อก', value: '฿1.24M', color: 'text-purple-500' },
            ].map(s => (
              <div key={s.label} className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
