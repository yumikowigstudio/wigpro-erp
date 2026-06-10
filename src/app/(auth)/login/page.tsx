'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { Eye, EyeOff, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      router.push('/dashboard')
    } catch {
      toast.error('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fdf0f5] via-[#f8e8f8] to-[#ede8ff] px-4 relative overflow-hidden">

      {/* Decorative blobs */}
      <div className="absolute top-[-120px] right-[-80px] w-96 h-96 bg-gradient-to-br from-[#f9a8d4]/40 to-[#e879f9]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-80px] left-[-60px] w-72 h-72 bg-gradient-to-br from-[#a78bfa]/30 to-[#f472b6]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/4 w-48 h-48 bg-[#fbcfe8]/20 rounded-full blur-2xl pointer-events-none" />

      <div className="relative w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#f472b6] to-[#d946a8] shadow-2xl shadow-pink-300/50 mb-4">
            <Sparkles className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">WigPro</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">ระบบบริหารร้านวิกผมและร้านตัดผม</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-3xl p-8 shadow-2xl shadow-pink-100/50">
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6">ยินดีต้อนรับกลับ 👋</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">อีเมล</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-3 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] focus:border-[var(--pink-300)] transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-12 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] focus:border-[var(--pink-300)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--pink-400)] transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-1">
              <label className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer select-none">
                <input type="checkbox" className="w-4 h-4 rounded accent-[var(--pink-500)]" />
                จดจำฉัน
              </label>
              <Link href="/forgot-password" className="text-[var(--pink-500)] hover:text-[var(--pink-600)] font-medium transition-colors">
                ลืมรหัสผ่าน?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] hover:from-[#ec4899] hover:to-[#db2777] text-white font-bold rounded-xl shadow-lg shadow-pink-200 hover:shadow-pink-300 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-sm mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  กำลังเข้าสู่ระบบ...
                </span>
              ) : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        <p className="text-center text-[var(--text-muted)] text-xs mt-6">
          © 2024 WigPro ERP · ระบบบริหารร้านวิกผมและร้านตัดผม
        </p>
      </div>
    </div>
  )
}
