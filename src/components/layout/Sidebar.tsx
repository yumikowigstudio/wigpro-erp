'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, CalendarDays, ShoppingCart, Package,
  Warehouse, Scissors, CreditCard, BarChart3, Settings,
  ChevronLeft, ChevronRight, UserCog, BookOpen,
  Bell, FileText, Star, LogOut, Building2,
  ChevronDown, ChevronUp, Factory, Receipt, TrendingUp, Undo2, ShieldCheck, ArrowLeftRight,
} from 'lucide-react'

interface NavItem {
  href?:     string
  label:     string
  icon:      React.ElementType
  badge?:    number
  children?: NavItem[]
  roles?:    string[]
  group?:    string
}

const navItems: NavItem[] = [
  { href: '/pos',          label: 'POS ขาย',        icon: ShoppingCart,    group: 'หลัก' },
  { href: '/dashboard',    label: 'แดชบอร์ด',      icon: LayoutDashboard, group: 'หลัก' },
  { href: '/customers',    label: 'ลูกค้า',          icon: Users,           group: 'หลัก' },
  { href: '/appointments', label: 'นัดหมาย',         icon: CalendarDays,    group: 'หลัก' },
  { href: '/members',      label: 'สมาชิก',          icon: Star,            group: 'หลัก' },
  {
    label: 'สินค้าและสต๊อก', icon: Package, group: 'คลัง',
    children: [
      { href: '/products',  label: 'รายการสินค้า', icon: Package },
      { href: '/inventory', label: 'สต๊อกสินค้า',  icon: Warehouse },
    ],
  },
  { href: '/production',  label: 'งานผลิตวิก',   icon: Factory,   group: 'คลัง' },
  { href: '/returns',     label: 'คืน/เปลี่ยนสินค้า', icon: Undo2,  group: 'คลัง' },
  { href: '/transfers',   label: 'โอนสินค้า',     icon: ArrowLeftRight, group: 'คลัง' },
  { href: '/deposits',    label: 'มัดจำ',         icon: CreditCard, group: 'การเงิน' },
  { href: '/quotations',  label: 'ใบเสนอราคา',    icon: FileText,   group: 'การเงิน' },
  { href: '/accounting',  label: 'บัญชี',         icon: Receipt,    group: 'การเงิน' },
  { href: '/commissions', label: 'คอมมิชชั่น',    icon: TrendingUp, group: 'การเงิน' },
  { href: '/reports',     label: 'รายงาน',        icon: BarChart3,  group: 'การเงิน' },
  { href: '/staff',       label: 'พนักงาน',       icon: UserCog,    group: 'จัดการ', roles: ['super_admin','owner','branch_manager'] },
  { href: '/settings',    label: 'ตั้งค่า',       icon: Settings,   group: 'จัดการ', roles: ['super_admin','owner','branch_manager'] },
  { href: '/admin',       label: 'หลังบ้าน (Admin)', icon: ShieldCheck, group: 'จัดการ', roles: ['super_admin'] },
]

function NavGroup({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 border-t border-[var(--border-light)]" />
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-bold tracking-widest text-[var(--text-light)] uppercase select-none">
      {label}
    </p>
  )
}

function NavItemComponent({ item, collapsed, depth = 0 }: { item: NavItem; collapsed: boolean; depth?: number }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  // ซ่อนเมนูที่จำกัด role ถ้ายังไม่มี user หรือ role ไม่อยู่ในรายการ (กันเมนูโผล่ตอนโหลด)
  if (item.roles && (!user || !item.roles.includes(user.role))) return null

  const isActive = item.href
    ? pathname === item.href || pathname.startsWith(item.href + '/')
    : false

  if (item.children?.length) {
    const anyChildActive = item.children.some(c => c.href && (pathname === c.href || pathname.startsWith(c.href + '/')))
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition-all duration-200',
            anyChildActive
              ? 'bg-[var(--pink-50)] text-[var(--pink-500)]'
              : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]',
          )}
        >
          <item.icon className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left font-medium">{item.label}</span>
              {open || anyChildActive
                ? <ChevronUp className="w-3.5 h-3.5 opacity-60" />
                : <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
            </>
          )}
        </button>
        {(open || anyChildActive) && !collapsed && (
          <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-[var(--pink-100)] pl-3">
            {item.children.map(c => (
              <NavItemComponent key={c.href} item={c} collapsed={collapsed} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href!}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 group',
        isActive
          ? 'bg-gradient-to-r from-[#f472b6] to-[#c084fc] text-white shadow-lg shadow-pink-200/60'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-secondary)]',
        depth > 0 && 'text-xs py-2 rounded-xl',
      )}
    >
      <item.icon className={cn('shrink-0 transition-transform group-hover:scale-110', depth > 0 ? 'w-3.5 h-3.5' : 'w-[18px] h-[18px]')} />
      {!collapsed && (
        <span className="flex-1">{item.label}</span>
      )}
      {!collapsed && item.badge && item.badge > 0 && (
        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center bg-white/30 text-white">
          {item.badge}
        </span>
      )}
      {/* Tooltip when collapsed */}
      {collapsed && (
        <div className="absolute left-full ml-3 px-3 py-1.5 bg-[var(--text-primary)] text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl transition-opacity">
          {item.label}
        </div>
      )}
    </Link>
  )
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, currentBranch, logout } = useAuth()

  // Group nav items
  const groups = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group ?? 'อื่นๆ'
    if (!acc[g]) acc[g] = []
    acc[g].push(item)
    return acc
  }, {})

  return (
    <aside
      style={{ width: collapsed ? '70px' : '240px' }}
      className="fixed left-0 top-0 h-full flex flex-col transition-all duration-300 z-40"
    >
      {/* Sidebar card — floating glass */}
      <div className="m-3 flex-1 flex flex-col bg-white rounded-3xl shadow-[var(--shadow-md)] border border-[var(--border-light)] overflow-hidden">

        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-[var(--border-light)]', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl luxury-gradient flex items-center justify-center shadow-md shadow-pink-200">
                <span className="text-white text-base font-bold">W</span>
              </div>
              <div>
                <p className="font-bold text-[var(--text-primary)] text-sm leading-tight">
                  Wig<span className="text-[var(--pink-500)]">Pro</span>
                </p>
                <p className="text-[var(--text-light)] text-[10px]">ERP System</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-9 h-9 rounded-2xl luxury-gradient flex items-center justify-center shadow-md shadow-pink-200">
              <span className="text-white text-base font-bold">W</span>
            </div>
          )}
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--pink-100)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--pink-500)] transition-all shrink-0"
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Branch pill */}
        {!collapsed && currentBranch && (
          <div className="mx-3 mt-3 px-3 py-2 bg-gradient-to-r from-[var(--pink-50)] to-purple-50 rounded-2xl border border-[var(--border-light)]">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-[var(--pink-400)] shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] text-[var(--text-light)] uppercase tracking-widest">สาขา</p>
                <p className="text-[var(--text-secondary)] text-xs font-semibold truncate">{currentBranch.name}</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {Object.entries(groups).map(([groupName, items]) => (
            <div key={groupName}>
              <NavGroup label={groupName} collapsed={collapsed} />
              <div className="space-y-0.5">
                {items.map(item => (
                  <NavItemComponent key={item.href || item.label} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-[var(--border-light)]">
          <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
            <div className="w-9 h-9 rounded-2xl luxury-gradient flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm shadow-pink-200">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[var(--text-secondary)] text-xs font-semibold truncate">{user?.displayName}</p>
                  <p className="text-[var(--text-light)] text-[10px] capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={logout}
                  title="ออกจากระบบ"
                  className="w-7 h-7 rounded-xl hover:bg-red-50 flex items-center justify-center text-[var(--text-light)] hover:text-red-400 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
