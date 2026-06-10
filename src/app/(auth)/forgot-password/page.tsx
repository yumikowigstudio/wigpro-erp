'use client'
import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { toast } from 'sonner'
import { ArrowLeft, Sparkles, Mail } from 'lucide-react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setSent(true)
      toast.success('ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว')
    } catch {
      toast.error('ไม่พบอีเมลนี้ในระบบ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fdf0f5] via-[#f8e8f8] to-[#ede8ff] px-4 relative overflow-hidden">
      <div className="absolute top-[-120px] right-[-80px] w-96 h-96 bg-gradient-to-br from-[#f9a8d4]/40 to-[#e879f9]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-80px] left-[-60px] w-72 h-72 bg-gradient-to-br from-[#a78bfa]/30 to-[#f472b6]/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#f472b6] to-[#d946a8] shadow-2xl shadow-pink-300/50 mb-4">
            <Sparkles className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">WigPro</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">รีเซ็ตรหัสผ่าน</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-3xl p-8 shadow-2xl shadow-pink-100/50">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">ส่งอีเมลแล้ว! ✅</h2>
              <p className="text-sm text-[var(--text-muted)]">
                ตรวจสอบอีเมล <span className="font-medium text-[var(--text-primary)]">{email}</span><br />
                แล้วคลิกลิงก์เพื่อตั้งรหัสผ่านใหม่
              </p>
              <Link href="/login"
                className="inline-flex items-center gap-2 text-[var(--pink-500)] hover:text-[var(--pink-600)] font-medium text-sm">
                <ArrowLeft className="w-4 h-4" /> กลับไปหน้า Login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">ลืมรหัสผ่าน?</h2>
              <p className="text-sm text-[var(--text-muted)] mb-6">กรอกอีเมลที่ลงทะเบียนไว้ ระบบจะส่งลิงก์รีเซ็ตให้</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1.5">อีเมล</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com" required
                    className="w-full px-4 py-3 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] transition-all" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white font-bold rounded-xl shadow-lg shadow-pink-200 active:scale-[0.98] transition-all disabled:opacity-60 text-sm">
                  {loading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--pink-500)] transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> กลับไปหน้า Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
