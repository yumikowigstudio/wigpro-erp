'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Bell, Search, Menu, ChevronDown, Building2, LogOut, Settings, User, XCircle } from 'lucide-react'
import Link from 'next/link'

export default function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { user, currentBranch, branches, canSwitchBranch, switchBranch, logout, isSupportMode, supportCompanyName, exitSupportCompany } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  return (
    <header className="h-16 flex items-center px-5 gap-4 sticky top-0 z-30">
      {/* Mobile menu */}
      <button
        onClick={onMenuToggle}
        className="md:hidden p-2 rounded-xl hover:bg-white/60 text-[var(--text-muted)] transition-all"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search bar — glass style */}
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="ค้นหาลูกค้า สินค้า ใบเสร็จ..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/70 backdrop-blur-sm border border-[var(--border-light)] rounded-2xl text-sm placeholder:text-[var(--text-light)] focus:outline-none focus:border-[var(--pink-300)] focus:bg-white transition-all shadow-[var(--shadow-sm)]"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {isSupportMode && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-700 shadow-[var(--shadow-sm)]">
            <span className="text-xs font-semibold">โหมดดูแล: {supportCompanyName || 'ร้านลูกค้า'}</span>
            <button onClick={exitSupportCompany} title="ออกจากโหมดดูแลร้าน" className="hover:text-amber-900">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Branch badge */}
        {currentBranch && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white/70 border border-[var(--border-light)] rounded-2xl shadow-[var(--shadow-sm)] backdrop-blur-sm">
            <Building2 className="w-3.5 h-3.5 text-[var(--pink-400)]" />
            {canSwitchBranch && branches.length > 1 ? (
              <select
                value={currentBranch.id}
                onChange={e => switchBranch(e.target.value)}
                className="max-w-32 bg-transparent text-xs font-medium text-[var(--text-secondary)] focus:outline-none cursor-pointer"
                title="เลือกสาขาที่ต้องการดู"
              >
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium text-[var(--text-secondary)]">{currentBranch.name}</span>
            )}
          </div>
        )}

        {/* Bell */}
        <Link
          href="/notifications"
          className="relative p-2.5 rounded-2xl bg-white/70 border border-[var(--border-light)] hover:bg-white text-[var(--text-muted)] hover:text-[var(--pink-500)] transition-all shadow-[var(--shadow-sm)] backdrop-blur-sm"
        >
          <Bell className="w-4.5 h-4.5 w-[18px] h-[18px]" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--pink-500)] rounded-full ring-2 ring-white" />
        </Link>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-2xl bg-white/70 border border-[var(--border-light)] hover:bg-white transition-all shadow-[var(--shadow-sm)] backdrop-blur-sm"
          >
            <div className="w-8 h-8 rounded-xl luxury-gradient flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-pink-200">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{user?.displayName}</p>
              <p className="text-[10px] text-[var(--text-muted)] capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-2 w-52 bg-white/90 backdrop-blur-xl rounded-3xl shadow-[var(--shadow-lg)] border border-[var(--border-light)] z-50 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-[var(--pink-50)] to-purple-50 border-b border-[var(--border-light)]">
                  <p className="font-semibold text-sm text-[var(--text-primary)]">{user?.displayName}</p>
                  <p className="text-xs text-[var(--text-muted)]">{user?.email}</p>
                </div>
                <div className="p-2">
                  <Link
                    href="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-[var(--bg-subtle)] text-sm text-[var(--text-secondary)] transition-all"
                  >
                    <User className="w-4 h-4 text-[var(--pink-400)]" /> โปรไฟล์
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-[var(--bg-subtle)] text-sm text-[var(--text-secondary)] transition-all"
                  >
                    <Settings className="w-4 h-4 text-[var(--pink-400)]" /> ตั้งค่า
                  </Link>
                  <div className="my-1 border-t border-[var(--border-light)]" />
                  <button
                    onClick={() => { setShowUserMenu(false); logout() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl hover:bg-red-50 text-sm text-red-400 transition-all"
                  >
                    <LogOut className="w-4 h-4" /> ออกจากระบบ
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
