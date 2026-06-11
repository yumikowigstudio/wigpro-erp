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
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { Appointment, Sale } from '@/types'

const PROD_COLORS: Record<string, string> = {
  pending: '#fbbf24', in_progress: '#c084fc', qc: '#60a5fa', ready: '#4ade80'
}
const PROD_LABELS: Record<string, string> = {
  pending: 'รอผลิต', in_progress: 'กำลังผลิต', qc: 'QC', ready: 'พร้อมส่ง'
}

const statusCfg: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'รอยืนยัน',  cls: 'badge-amber' },
  confirmed: { label: 'ยืนยันแล้ว', cls: 'badge-blue'  },
  arrived:   { label: 'มาถึงแล้ว', cls: 'badge-green'  },
}

type Period = 'day' | 'week' | 'month' | 'year'

function getPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const now   = new Date()
  const end   = new Date(now); end.setHours(23,59,59,999)
  const start = new Date(now); start.setHours(0,0,0,0)

  switch (period) {
    case 'week':
      // Monday of this week
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      break
    case 'month':
      start.setDate(1)
      break
    case 'year':
      start.setMonth(0); start.setDate(1)
      break
  }
  const labels: Record<Period, string> = { day: 'วันนี้', week: 'สัปดาห์นี้', month: 'เดือนนี้', year: 'ปีนี้' }
  return { start, end, label: labels[period] }
}

export default function DashboardPage() {
  const { companyId, currentBranch } = useAuth()
  const [period, setPeriod]       = useState<Period>('month')

  /* Period-dependent data */
  const [periodSales,       setPeriodSales]       = useState<Sale[]>([])
  const [periodApts,        setPeriodApts]        = useState<Appointment[]>([])
  const [periodNewCust,     setPeriodNewCust]     = useState(0)

  /* Static data (not period-dependent) */
  const [todayApts,         setTodayApts]         = useState<Appointment[]>([])
  const [productionData,    setProductionData]    = useState<{ name: string; value: number; color: string }[]>([])
  const [lowStockItems,     setLowStockItems]     = useState<{ name: string; sku: string; qty: number; min: number }[]>([])
  const [stockStats,        setStockStats]        = useState({ skuCount: 0, totalValue: 0 })
  const [salesData,         setSalesData]         = useState([
    { name: 'ม.ค.', sales: 0 }, { name: 'ก.พ.', sales: 0 }, { name: 'มี.ค.', sales: 0 },
    { name: 'เม.ย.', sales: 0 }, { name: 'พ.ค.', sales: 0 }, { name: 'มิ.ย.', sales: 0 },
  ])
  const [sixMonthTotal, setSixMonthTotal] = useState(0)

  /* ─── Period-dependent queries ─── */
  useEffect(() => {
    if (!companyId) return
    const { start, end } = getPeriodRange(period)
    const tsStart = Timestamp.fromDate(start)
    const tsEnd   = Timestamp.fromDate(end)

    // Period sales — NO orderBy to avoid composite index (where+where already fine)
    const saleQ = query(
      collection(db, COLLECTIONS.SALES),
      where('companyId', '==', companyId),
      where('createdAt', '>=', tsStart),
      where('createdAt', '<=', tsEnd),
    )
    const u1 = onSnapshot(saleQ, snap => {
      setPeriodSales(snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[])
    }, () => {})

    // Period appointments
    const aptPeriodQ = query(
      collection(db, COLLECTIONS.APPOINTMENTS),
      where('companyId', '==', companyId),
      where('date', '>=', tsStart),
      where('date', '<=', tsEnd),
    )
    const u2 = onSnapshot(aptPeriodQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Appointment[]
      list.sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date)
        const db_ = b.date instanceof Date ? b.date : new Date(b.date)
        return da.getTime() - db_.getTime()
      })
      setPeriodApts(list)
    }, () => {})

    // New customers in period
    const custQ = query(
      collection(db, COLLECTIONS.CUSTOMERS),
      where('companyId', '==', companyId),
      where('createdAt', '>=', tsStart),
      where('createdAt', '<=', tsEnd),
    )
    const u3 = onSnapshot(custQ, snap => setPeriodNewCust(snap.size), () => {})

    return () => { u1(); u2(); u3() }
  }, [period, companyId])

  /* ─── Static queries (run once) ─── */
  useEffect(() => {
    if (!companyId) return
    const today    = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

    // Today's appointments for bottom card
    const aptTodayQ = query(
      collection(db, COLLECTIONS.APPOINTMENTS),
      where('companyId', '==', companyId),
      where('date', '>=', Timestamp.fromDate(today)),
      where('date', '<', Timestamp.fromDate(tomorrow)),
    )
    const u1 = onSnapshot(aptTodayQ, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Appointment[]
      list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
      setTodayApts(list)
    }, () => {})

    // 6-month sales chart
    const sixMonthsAgo = new Date(today)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    sixMonthsAgo.setDate(1); sixMonthsAgo.setHours(0,0,0,0)
    const monthSaleQ = query(
      collection(db, COLLECTIONS.SALES),
      where('companyId', '==', companyId),
      where('createdAt', '>=', Timestamp.fromDate(sixMonthsAgo)),
    )
    const u2 = onSnapshot(monthSaleQ, snap => {
      const allSales = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]
      setSixMonthTotal(allSales.reduce((s, r) => s + (r.totalAmount ?? 0), 0))
      const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
      const now2 = new Date()
      const chart = Array.from({ length: 6 }, (_, i) => {
        const mIdx = (now2.getMonth() - 5 + i + 12) % 12
        const yr   = now2.getFullYear() - (now2.getMonth() - 5 + i < 0 ? 1 : 0)
        const sales = allSales.filter(s => {
          const d = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt)
          return d.getMonth() === mIdx && d.getFullYear() === yr
        }).reduce((a, s) => a + (s.totalAmount ?? 0), 0)
        return { name: monthNames[mIdx], sales }
      })
      setSalesData(chart)
    }, () => {})

    // Production orders — filter by companyId, then filter status client-side
    const prodQ = query(
      collection(db, COLLECTIONS.PRODUCTION_ORDERS),
      where('companyId', '==', companyId),
    )
    const u3 = onSnapshot(prodQ, snap => {
      const counts: Record<string, number> = {}
      snap.docs.forEach(d => {
        const s = d.data().status as string
        if (['pending','in_progress','qc','ready'].includes(s)) {
          counts[s] = (counts[s] ?? 0) + 1
        }
      })
      setProductionData(
        Object.entries(counts).map(([status, value]) => ({
          name: PROD_LABELS[status] ?? status,
          value,
          color: PROD_COLORS[status] ?? '#ccc',
        }))
      )
    }, () => {})

    // Low stock (no orderBy — sort client-side)
    const u4 = onSnapshot(query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId)), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as { id: string; name: string; sku: string; stockQty: number; minStockQty: number; costPrice?: number }[]
      const sorted = [...all].sort((a, b) => (a.stockQty ?? 0) - (b.stockQty ?? 0))
      const low = sorted.filter(p => (p.stockQty ?? 0) <= (p.minStockQty || 5)).slice(0, 5)
      setLowStockItems(low.map(p => ({ name: p.name, sku: p.sku, qty: p.stockQty ?? 0, min: p.minStockQty || 5 })))
      setStockStats({
        skuCount: all.length,
        totalValue: all.reduce((s, p) => s + ((p.stockQty ?? 0) * (p.costPrice ?? 0)), 0),
      })
    }, () => {})

    return () => { u1(); u2(); u3(); u4() }
  }, [companyId])

  const periodSalesTotal  = periodSales.reduce((s, r) => s + (r.totalAmount ?? 0), 0)
  const totalProdPending  = productionData.reduce((s, p) => s + p.value, 0)
  const { label: periodLabel } = getPeriodRange(period)

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
          {(['day','week','month','year'] as Period[]).map(p => (
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
        <StatCard
          title={`ยอดขาย${periodLabel}`}
          value={formatCurrency(periodSalesTotal)}
          subtitle={`${periodSales.length} รายการ`}
          icon={TrendingUp} trend={{ value: 0, label: '' }} color="pink"
        />
        <StatCard
          title={`คิว${periodLabel}`}
          value={periodApts.length}
          subtitle={`${periodApts.filter(a => a.status === 'pending').length} รอยืนยัน`}
          icon={Calendar} trend={{ value: 0, label: '' }} color="teal"
        />
        <StatCard
          title="งานผลิตค้าง"
          value={totalProdPending}
          subtitle={`${productionData.find(p => p.name === 'พร้อมส่ง')?.value ?? 0} พร้อมส่ง`}
          icon={Factory} color="amber"
        />
        <StatCard
          title={`ลูกค้าใหม่${periodLabel}`}
          value={periodNewCust}
          subtitle={periodLabel}
          icon={Users} trend={{ value: 0, label: '' }} color="purple"
        />
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
              <p className="text-xl font-bold text-[var(--pink-500)]">{formatCurrency(sixMonthTotal)}</p>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">6 เดือนล่าสุด</p>
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
              <YAxis tick={{ fontSize: 11, fill: '#a88aac' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v as number)/1000}K`} />
              <Tooltip
                formatter={v => [formatCurrency(Number(v)), 'ยอดขาย']}
                contentStyle={{ borderRadius: '14px', border: '1px solid #edd5e8', boxShadow: '0 8px 24px rgba(180,100,160,0.15)', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="sales" stroke="#f472b6" strokeWidth={2.5} fill="url(#pinkGrad)"
                dot={{ r: 4, fill: '#f472b6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
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
          {productionData.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">ไม่มีงานผลิตค้าง ✅</div>
          ) : (
            <div className="flex justify-center my-1">
              <PieChart width={150} height={150}>
                <Pie data={productionData} cx={75} cy={75} innerRadius={48} outerRadius={68} paddingAngle={4} dataKey="value" startAngle={90} endAngle={-270}>
                  {productionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
              </PieChart>
            </div>
          )}
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

        {/* Today's appointments */}
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
            ) : todayApts.slice(0, 5).map(apt => {
              const s       = statusCfg[apt.status] ?? { label: apt.status, cls: 'badge-blue' }
              const svcName = apt.services?.map(sv => sv.serviceName).join(', ') ?? ''
              return (
                <div key={apt.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-base)] hover:bg-[var(--pink-50)] transition-all cursor-pointer group">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-sm font-bold text-[var(--pink-500)]">{apt.startTime}</p>
                  </div>
                  <div className="w-px h-8 bg-[var(--border-light)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{apt.customerName}</p>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                      <span className="flex items-center gap-1"><Scissors className="w-3 h-3" />{svcName}</span>
                      {apt.customerPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{apt.customerPhone}</span>}
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
            {lowStockItems.length === 0 && (
              <div className="py-6 text-center text-sm text-[var(--text-muted)]">✅ สต๊อกปกติทุกรายการ</div>
            )}
            {lowStockItems.map(item => (
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
                  <div className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full"
                    style={{ width: `${Math.min((item.qty / item.min) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-[var(--pink-500)]">{stockStats.skuCount}</p>
              <p className="text-xs text-[var(--text-muted)]">SKU ทั้งหมด</p>
            </div>
            <div className="bg-[var(--bg-base)] rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-purple-500">{formatCurrency(stockStats.totalValue)}</p>
              <p className="text-xs text-[var(--text-muted)]">มูลค่าสต๊อก</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
