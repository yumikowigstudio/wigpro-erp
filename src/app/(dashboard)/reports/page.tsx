'use client'
import { useState, useEffect, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { BarChart3, Download, TrendingUp, Users, Package, Factory, Star, Loader2, Building2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, convertTimestamps } from '@/lib/firestore'
import { isCountableDeposit, isCountableSale } from '@/lib/sales'
import { Sale, Customer, WorkOrder, Deposit } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { usePermissionAction } from '@/hooks/usePermissionAction'
import { downloadCsv } from '@/lib/export'

const monthNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const reportTabs = [
  { id: 'branches',  label: 'แยกสาขา',    icon: Building2  },
  { id: 'sales',      label: 'ยอดขาย',    icon: TrendingUp },
  { id: 'customers',  label: 'ลูกค้า',     icon: Users      },
  { id: 'products',   label: 'สินค้า',     icon: Package    },
  { id: 'production', label: 'งานผลิต',   icon: Factory    },
  { id: 'commission', label: 'คอมมิชชั่น', icon: Star       },
]

type ReportBranch = {
  id: string
  name: string
  code?: string
}

type BranchReportRow = ReportBranch & {
  billCount: number
  itemCount: number
  productQty: number
  serviceQty: number
  productSales: number
  serviceSales: number
  depositPaid: number
  depositOutstanding: number
  depositCount: number
  commission: number
  totalCollected: number
}

type BranchItemReportRow = {
  branchId: string
  branchName: string
  branchCode?: string
  type: 'product' | 'service'
  name: string
  qty: number
  revenue: number
  commission: number
}

const numberValue = (value: unknown) => {
  const next = Number(value ?? 0)
  return Number.isFinite(next) ? next : 0
}

const toDateInputValue = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const parseDateInput = (value: string, endOfDay = false) => {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
}

const isWithinDateRange = (date: Date | string | undefined, startDate: string, endDate: string) => {
  if (!date) return false
  const time = new Date(date).getTime()
  return time >= parseDateInput(startDate).getTime() && time <= parseDateInput(endDate, true).getTime()
}

export default function ReportsPage() {
  const { companyId, branchId, currentBranch, branches } = useAuth()
  const { ensurePermission, hasPermission } = usePermissionAction()
  const [activeTab, setActiveTab] = useState('branches')
  const [period, setPeriod]       = useState('month')
  const [loading, setLoading]     = useState(true)
  const [reportStartDate, setReportStartDate] = useState(() => {
    const now = new Date()
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1))
  })
  const [reportEndDate, setReportEndDate] = useState(() => toDateInputValue(new Date()))

  const [sales, setSales]               = useState<Sale[]>([])
  const [allSales6m, setAllSales6m]     = useState<Sale[]>([])
  const [customers, setCustomers]       = useState<Customer[]>([])
  const [workOrders, setWorkOrders]     = useState<WorkOrder[]>([])
  const [newCustCount, setNewCustCount] = useState(0)
  const [branchReportSales, setBranchReportSales]       = useState<Sale[]>([])
  const [branchReportDeposits, setBranchReportDeposits] = useState<Deposit[]>([])
  const [branchReportLoading, setBranchReportLoading]   = useState(true)

  useEffect(() => {
    if (!companyId || !branchId) return

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

    // No orderBy — sort client-side to avoid composite indexes
    const u1 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => {
        const list = (snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[])
          .filter(s => new Date(s.createdAt).getTime() >= start.getTime())
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setSales(list); check()
      },
      () => check()
    )
    const u2 = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => {
        const list = (snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[])
          .filter(s => new Date(s.createdAt).getTime() >= sixMonthsAgo.getTime())
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setAllSales6m(list); check()
      },
      () => check()
    )
    const u3 = onSnapshot(
      query(collection(db, COLLECTIONS.CUSTOMERS), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Customer[]
        // Filter deleted + sort by createdAt desc client-side
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        const activeCustomers = list.filter(c => c.status !== 'deleted')
        setCustomers(activeCustomers)
        setNewCustCount(activeCustomers.filter(c => new Date(c.createdAt).getTime() >= start.getTime()).length)
        check()
      },
      () => check()
    )
    const u4 = onSnapshot(
      query(collection(db, COLLECTIONS.WORK_ORDERS), where('companyId', '==', companyId), where('branchId', '==', branchId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as WorkOrder[]
        // Filter active orders client-side
        setWorkOrders(list.filter(o => !['delivered','cancelled'].includes(o.status ?? ''))); check()
      },
      () => check()
    )

    return () => { u1(); u2(); u3(); u4() }
  }, [branchId, period, companyId])

  useEffect(() => {
    if (!companyId) return
    setBranchReportLoading(true)
    let done = 0
    const check = () => { done++; if (done >= 2) setBranchReportLoading(false) }

    const salesUnsub = onSnapshot(
      query(collection(db, COLLECTIONS.SALES), where('companyId', '==', companyId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Sale[]
        setBranchReportSales(list)
        check()
      },
      () => check()
    )
    const depositsUnsub = onSnapshot(
      query(collection(db, COLLECTIONS.DEPOSITS), where('companyId', '==', companyId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...convertTimestamps(d.data()) })) as Deposit[]
        setBranchReportDeposits(list)
        check()
      },
      () => check()
    )

    return () => { salesUnsub(); depositsUnsub() }
  }, [companyId])

  const countableSales = useMemo(() => sales.filter(isCountableSale), [sales])
  const countableSales6m = useMemo(() => allSales6m.filter(isCountableSale), [allSales6m])
  const countableBranchReportSales = useMemo(() => branchReportSales.filter(isCountableSale), [branchReportSales])
  const countableBranchReportDeposits = useMemo(() => branchReportDeposits.filter(isCountableDeposit), [branchReportDeposits])
  const totalRevenue = countableSales.reduce((a, s) => a + s.totalAmount, 0)

  // 6-month chart
  const now = new Date()
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const m = (now.getMonth() - 5 + i + 12) % 12
    const y = now.getFullYear() - (now.getMonth() - 5 + i < 0 ? 1 : 0)
    const revenue = countableSales6m
      .filter(s => { const d = new Date(s.createdAt); return d.getMonth() === m && d.getFullYear() === y })
      .reduce((a, s) => a + s.totalAmount, 0)
    return { name: monthNames[m], revenue }
  })

  // Top products from sale items
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  countableSales.forEach(s => s.items?.forEach(item => {
    const key = item.name
    const existing = productMap.get(key) ?? { name: key, qty: 0, revenue: 0 }
    productMap.set(key, {
      name: key,
      qty: existing.qty + (item.quantity ?? 1),
      revenue: existing.revenue + item.total,
    })
  }))
  const allProductsSold = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue)
  const topProducts = allProductsSold.slice(0, 5)

  // รายได้แยกสินค้า / บริการ
  let productRevenue = 0, serviceRevenue = 0
  countableSales.forEach(s => s.items?.forEach(item => {
    if (item.type === 'service') serviceRevenue += item.total
    else productRevenue += item.total
  }))

  // คอมมิชชั่นต่อพนักงาน (จากรายการขายที่ระบุผู้ขาย)
  const commMap = new Map<string, { name: string; commission: number; items: number; sales: number }>()
  countableSales.forEach(s => s.items?.forEach(item => {
    if (!item.staffName || !item.commissionAmount) return
    const ex = commMap.get(item.staffName) ?? { name: item.staffName, commission: 0, items: 0, sales: 0 }
    commMap.set(item.staffName, {
      name: item.staffName,
      commission: ex.commission + (item.commissionAmount ?? 0),
      items: ex.items + 1,
      sales: ex.sales + (item.total ?? 0),
    })
  }))
  const commissionByStaff = Array.from(commMap.values()).sort((a, b) => b.commission - a.commission)

  const branchReport = useMemo(() => {
    const branchMap = new Map<string, ReportBranch>()
    branches.forEach(branch => {
      branchMap.set(branch.id, { id: branch.id, name: branch.name, code: branch.code })
    })
    if (currentBranch && !branchMap.has(currentBranch.id)) {
      branchMap.set(currentBranch.id, { id: currentBranch.id, name: currentBranch.name, code: currentBranch.code })
    }

    countableBranchReportSales.forEach(sale => {
      if (!sale.branchId || branchMap.has(sale.branchId)) return
      branchMap.set(sale.branchId, {
        id: sale.branchId,
        name: sale.branchName || 'ไม่ระบุสาขา',
        code: sale.branchCode,
      })
    })
    countableBranchReportDeposits.forEach(deposit => {
      if (!deposit.branchId || branchMap.has(deposit.branchId)) return
      branchMap.set(deposit.branchId, {
        id: deposit.branchId,
        name: deposit.branchName || 'ไม่ระบุสาขา',
        code: deposit.branchCode,
      })
    })

    const rows: BranchReportRow[] = Array.from(branchMap.values())
      .map(branch => ({
        ...branch,
        billCount: 0,
        itemCount: 0,
        productQty: 0,
        serviceQty: 0,
        productSales: 0,
        serviceSales: 0,
        depositPaid: 0,
        depositOutstanding: 0,
        depositCount: 0,
        commission: 0,
        totalCollected: 0,
      }))
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'th') || a.name.localeCompare(b.name, 'th'))

    const rowMap = new Map(rows.map(row => [row.id, row]))
    const itemMap = new Map<string, BranchItemReportRow>()

    countableBranchReportSales
      .filter(sale => isWithinDateRange(sale.createdAt, reportStartDate, reportEndDate))
      .forEach(sale => {
        const row = rowMap.get(sale.branchId)
        if (!row) return
        row.billCount += 1
        sale.items?.forEach(item => {
          const qty = numberValue(item.quantity ?? 1)
          const revenue = numberValue(item.total)
          const commission = numberValue(item.commissionAmount)
          const type = item.type === 'service' || item.serviceId ? 'service' : 'product'

          row.itemCount += 1
          row.commission += commission
          if (type === 'service') {
            row.serviceQty += qty
            row.serviceSales += revenue
          } else {
            row.productQty += qty
            row.productSales += revenue
          }

          const key = `${sale.branchId}-${type}-${item.name}`
          const existing = itemMap.get(key) ?? {
            branchId: sale.branchId,
            branchName: row.name,
            branchCode: row.code,
            type,
            name: item.name,
            qty: 0,
            revenue: 0,
            commission: 0,
          }
          itemMap.set(key, {
            ...existing,
            qty: existing.qty + qty,
            revenue: existing.revenue + revenue,
            commission: existing.commission + commission,
          })
        })
      })

    countableBranchReportDeposits
      .filter(deposit => isWithinDateRange(deposit.createdAt, reportStartDate, reportEndDate))
      .forEach(deposit => {
        const row = rowMap.get(deposit.branchId)
        if (!row) return
        row.depositCount += 1
        row.depositPaid += numberValue(deposit.paidAmount)
        row.depositOutstanding += numberValue(deposit.remainingAmount)
      })

    rows.forEach(row => {
      row.totalCollected = row.productSales + row.serviceSales + row.depositPaid
    })

    const totals = rows.reduce((acc, row) => ({
      billCount: acc.billCount + row.billCount,
      itemCount: acc.itemCount + row.itemCount,
      productQty: acc.productQty + row.productQty,
      serviceQty: acc.serviceQty + row.serviceQty,
      depositCount: acc.depositCount + row.depositCount,
      productSales: acc.productSales + row.productSales,
      serviceSales: acc.serviceSales + row.serviceSales,
      depositPaid: acc.depositPaid + row.depositPaid,
      depositOutstanding: acc.depositOutstanding + row.depositOutstanding,
      commission: acc.commission + row.commission,
      totalCollected: acc.totalCollected + row.totalCollected,
    }), {
      billCount: 0,
      itemCount: 0,
      productQty: 0,
      serviceQty: 0,
      depositCount: 0,
      productSales: 0,
      serviceSales: 0,
      depositPaid: 0,
      depositOutstanding: 0,
      commission: 0,
      totalCollected: 0,
    })

    return {
      rows,
      itemRows: Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue),
      totals,
    }
  }, [countableBranchReportDeposits, countableBranchReportSales, branches, currentBranch, reportEndDate, reportStartDate])

  // Export ตามแท็บที่เปิดอยู่
  const stamp = new Date().toISOString().slice(0, 10)
  const handleExport = async () => {
    if (!await ensurePermission('action.reports.export', 'ส่งออกรายงาน')) return
    if (activeTab === 'branches') {
      downloadCsv(`branch-report-${reportStartDate}-${reportEndDate}`, ['สาขา','รหัสสาขา','จำนวนบิล','ยอดขายสินค้า','ยอดขายบริการ','รับมัดจำ','ค้างชำระ','คอมมิชชั่น','รวมรับ'],
        branchReport.rows.map(r => [r.name, r.code ?? '', r.billCount, r.productSales.toFixed(2), r.serviceSales.toFixed(2), r.depositPaid.toFixed(2), r.depositOutstanding.toFixed(2), r.commission.toFixed(2), r.totalCollected.toFixed(2)]))
    } else if (activeTab === 'customers') {
      downloadCsv(`customers-${stamp}`, ['ชื่อ','เบอร์โทร','ระดับสมาชิก','แต้ม'],
        customers.map(c => [`${c.firstName} ${c.lastName ?? ''}`.trim(), c.phone ?? '', c.memberLevel ?? '', c.points ?? 0]))
    } else if (activeTab === 'commission') {
      downloadCsv(`commission-${stamp}`, ['พนักงาน','จำนวนรายการ','ยอดขาย','คอมมิชชั่น'],
        commissionByStaff.map(r => [r.name, r.items, r.sales.toFixed(2), r.commission.toFixed(2)]))
    } else if (activeTab === 'production') {
      downloadCsv(`production-${stamp}`, ['ออเดอร์','ลูกค้า','สถานะ','ยอด'],
        workOrders.map(w => [w.orderNo, w.customerName, w.status, w.totalAmount]))
    } else {
      // sales / products → รายการสินค้าที่ขาย
      downloadCsv(`products-sold-${stamp}`, ['สินค้า/บริการ','จำนวน','ยอดขาย'],
        allProductsSold.map(p => [p.name, p.qty, p.revenue.toFixed(2)]))
    }
  }

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
          <p className="text-sm text-[var(--text-muted)]">ข้อมูลเชิงธุรกิจแบบ Real-time{currentBranch?.name ? ` · สาขา ${currentBranch.name}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === 'branches' ? (
            <>
              <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)}
                className="px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none" />
              <span className="self-center text-xs text-[var(--text-muted)]">ถึง</span>
              <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)}
                className="px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none" />
            </>
          ) : (
            <select value={period} onChange={e => { setPeriod(e.target.value) }}
              className="px-3 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm focus:outline-none">
              <option value="day">วันนี้</option>
              <option value="week">สัปดาห์นี้</option>
              <option value="month">เดือนนี้</option>
              <option value="year">ปีนี้</option>
            </select>
          )}
          <button onClick={handleExport} title={hasPermission('action.reports.export') ? 'Export CSV' : 'ต้องขอสิทธิ์ส่งออกรายงาน'} className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm hover:bg-[var(--bg-base)] transition-all">
            <Download className="w-4 h-4" /> Export CSV
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
          {activeTab === 'branches' ? (
            branchReportLoading ? (
              <div className="py-20 text-center"><Loader2 className="w-8 h-8 text-[var(--pink-300)] mx-auto animate-spin" /></div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'ยอดขายสินค้า', value: formatCurrency(branchReport.totals.productSales), note: `${branchReport.totals.productQty} ชิ้น`, color: 'text-[var(--pink-600)]' },
                    { label: 'ยอดขายบริการ', value: formatCurrency(branchReport.totals.serviceSales), note: `${branchReport.totals.serviceQty} รายการ`, color: 'text-blue-600' },
                    { label: 'รับมัดจำ', value: formatCurrency(branchReport.totals.depositPaid), note: `${branchReport.totals.depositCount} ใบ`, color: 'text-emerald-600' },
                    { label: 'ค้างชำระ', value: formatCurrency(branchReport.totals.depositOutstanding), note: 'จากมัดจำในช่วงนี้', color: 'text-red-500' },
                    { label: 'คอมมิชชั่น', value: formatCurrency(branchReport.totals.commission), note: 'ตามพนักงานขาย', color: 'text-purple-600' },
                    { label: 'บิลขาย', value: String(branchReport.totals.billCount), note: 'ไม่รวมบิลยกเลิก', color: 'text-amber-600' },
                  ].map(card => (
                    <div key={card.label} className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-base)] p-4">
                      <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
                      <p className="text-xs font-medium text-[var(--text-primary)] mt-1">{card.label}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{card.note}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-[var(--border-light)] overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 bg-[var(--pink-50)]/60 border-b border-[var(--border-light)]">
                    <div>
                      <h3 className="font-semibold text-[var(--text-primary)]">สรุปยอดตามสาขา</h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        ช่วง {parseDateInput(reportStartDate).toLocaleDateString('th-TH')} - {parseDateInput(reportEndDate).toLocaleDateString('th-TH')}
                      </p>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{branchReport.rows.length} สาขา</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-light)] bg-white">
                          <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">สาขา</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">บิล</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">สินค้า</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">บริการ</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">รับมัดจำ</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">ค้างชำระ</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">คอมฯ</th>
                          <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-4 py-3">รวมรับ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-light)]">
                        {branchReport.rows.map(row => (
                          <tr key={row.id} className="hover:bg-[var(--pink-50)]/30">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-[var(--text-primary)]">{row.name}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{row.code ? `รหัส ${row.code}` : 'ไม่ระบุรหัสสาขา'}</p>
                            </td>
                            <td className="px-3 py-3 text-right text-[var(--text-secondary)]">{row.billCount}</td>
                            <td className="px-3 py-3 text-right">
                              <p className="font-semibold text-[var(--pink-600)]">{formatCurrency(row.productSales)}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{row.productQty} ชิ้น</p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <p className="font-semibold text-blue-600">{formatCurrency(row.serviceSales)}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{row.serviceQty} รายการ</p>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <p className="font-semibold text-emerald-600">{formatCurrency(row.depositPaid)}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{row.depositCount} ใบ</p>
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-red-500">{formatCurrency(row.depositOutstanding)}</td>
                            <td className="px-3 py-3 text-right font-semibold text-purple-600">{formatCurrency(row.commission)}</td>
                            <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">{formatCurrency(row.totalCollected)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-light)] overflow-hidden">
                  <div className="px-4 py-3 bg-white border-b border-[var(--border-light)]">
                    <h3 className="font-semibold text-[var(--text-primary)]">รายละเอียดสินค้า/บริการที่ขายได้</h3>
                    <p className="text-xs text-[var(--text-muted)]">เรียงตามยอดขายสูงสุด แสดงสูงสุด 50 รายการ</p>
                  </div>
                  {branchReport.itemRows.length === 0 ? (
                    <p className="text-center text-sm text-[var(--text-muted)] py-8">ยังไม่มีรายการขายในช่วงวันที่นี้</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border-light)] bg-[var(--bg-base)]">
                            <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">สาขา</th>
                            <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-3 py-3">ประเภท</th>
                            <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-3 py-3">รายการ</th>
                            <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">จำนวน</th>
                            <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-3 py-3">ยอดขาย</th>
                            <th className="text-right text-xs font-semibold text-[var(--text-muted)] px-4 py-3">คอมฯ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-light)]">
                          {branchReport.itemRows.slice(0, 50).map(item => (
                            <tr key={`${item.branchId}-${item.type}-${item.name}`} className="hover:bg-[var(--pink-50)]/30">
                              <td className="px-4 py-3">
                                <p className="font-medium text-[var(--text-primary)]">{item.branchName}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{item.branchCode ? `รหัส ${item.branchCode}` : ''}</p>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.type === 'service' ? 'bg-blue-50 text-blue-600' : 'bg-[var(--pink-50)] text-[var(--pink-600)]'}`}>
                                  {item.type === 'service' ? 'บริการ' : 'สินค้า'}
                                </span>
                              </td>
                              <td className="px-3 py-3 font-medium text-[var(--text-primary)] min-w-[180px]">{item.name}</td>
                              <td className="px-3 py-3 text-right text-[var(--text-secondary)]">{item.qty}</td>
                              <td className="px-3 py-3 text-right font-semibold text-[var(--pink-600)]">{formatCurrency(item.revenue)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-purple-600">{formatCurrency(item.commission)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : loading ? (
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
          ) : activeTab === 'products' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--pink-50)] p-4 text-center">
                  <p className="text-xl font-bold text-[var(--pink-600)]">{formatCurrency(productRevenue)}</p>
                  <p className="text-xs text-[var(--text-muted)]">รายได้จากสินค้า</p>
                </div>
                <div className="rounded-xl bg-blue-50 p-4 text-center">
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(serviceRevenue)}</p>
                  <p className="text-xs text-[var(--text-muted)]">รายได้จากบริการ</p>
                </div>
              </div>
              <h3 className="font-semibold text-[var(--text-primary)]">รายการที่ขายได้ ({allProductsSold.length})</h3>
              {allProductsSold.length === 0 ? (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">ยังไม่มีข้อมูล</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-[var(--border-light)]">
                      <th className="text-left text-xs font-semibold text-[var(--text-muted)] pb-2">สินค้า/บริการ</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] pb-2">จำนวน</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] pb-2">ยอดขาย</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border-light)]">
                      {allProductsSold.map(p => (
                        <tr key={p.name} className="hover:bg-[var(--pink-50)]/30">
                          <td className="py-2.5 font-medium truncate max-w-[200px]">{p.name}</td>
                          <td className="py-2.5 text-right text-[var(--text-secondary)]">{p.qty}</td>
                          <td className="py-2.5 text-right font-semibold text-[var(--pink-500)]">{formatCurrency(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'commission' ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-[var(--text-primary)]">คอมมิชชั่นพนักงาน (ช่วงที่เลือก)</h3>
              {commissionByStaff.length === 0 ? (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">ยังไม่มีคอมมิชชั่น — ระบุพนักงานขายตอนคีย์ขายใน POS</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-[var(--border-light)]">
                      <th className="text-left text-xs font-semibold text-[var(--text-muted)] pb-2">พนักงาน</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] pb-2">รายการ</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] pb-2">ยอดขาย</th>
                      <th className="text-right text-xs font-semibold text-[var(--text-muted)] pb-2">คอมมิชชั่น</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border-light)]">
                      {commissionByStaff.map(r => (
                        <tr key={r.name} className="hover:bg-[var(--pink-50)]/30">
                          <td className="py-2.5 font-medium">{r.name}</td>
                          <td className="py-2.5 text-right text-[var(--text-secondary)]">{r.items}</td>
                          <td className="py-2.5 text-right text-[var(--text-secondary)]">{formatCurrency(r.sales)}</td>
                          <td className="py-2.5 text-right font-semibold text-emerald-600">{formatCurrency(r.commission)}</td>
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
