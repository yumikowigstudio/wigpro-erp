'use client'
import { useEffect } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp, getDocs, collection, query, where as fsWhere, limit } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { getCollection, COLLECTIONS, where } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { User, Branch } from '@/types'
import { toast } from 'sonner'

// ───────────────────────────────────────────────────────────────
// Auth listener เป็น "singleton" — ตั้งครั้งเดียวทั้งแอป
// ไม่ว่าจะมี component เรียก useAuth() กี่ตัว/เปลี่ยนหน้ากี่ครั้ง ก็ใช้ listener
// ชุดเดียวกัน เขียนค่าลง zustand store แล้วทุก component อ่านจาก store
// (เดิม: ทุก useAuth() สร้าง onAuthStateChanged + onSnapshot ใหม่ → ช้าทุกหน้า)
// ───────────────────────────────────────────────────────────────
let authListenerStarted = false

function startAuthListener() {
  if (authListenerStarted) return
  authListenerStarted = true

  const {
    setFirebaseUser, setUser, setCurrentBranch, setBranches, setLoading,
  } = useAuthStore.getState()

  let unsubscribeUser: (() => void) | null = null

  onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)

      // ยกเลิก listener เก่าถ้ามี
      if (unsubscribeUser) {
        unsubscribeUser()
        unsubscribeUser = null
      }

      if (fbUser) {
        // ใช้ onSnapshot แทน getDoc — จะ update อัตโนมัติเมื่อ Firestore เปลี่ยน
        const userRef = doc(db, COLLECTIONS.USERS, fbUser.uid)
        unsubscribeUser = onSnapshot(userRef, async (snap) => {
          if (snap.exists()) {
            const userData = { id: snap.id, ...snap.data() } as User

            // แปลง Timestamp เป็น Date
            const ud = userData as unknown as Record<string, unknown>
            if (ud.createdAt && typeof ud.createdAt === 'object') {
              const ts = ud.createdAt as { toDate?: () => Date }
              if (ts.toDate) ud.createdAt = ts.toDate()
            }

            setUser(userData)

            // โหลดสาขาถ้ายังไม่มี
            if (useAuthStore.getState().branches.length === 0) {
              try {
                const branchList = await getCollection<Branch>(COLLECTIONS.BRANCHES, [
                  where('companyId', '==', userData.companyId),
                  where('status', '==', 'active'),
                ])
                setBranches(branchList)
                if (userData.branchId) {
                  const branch = branchList.find(b => b.id === userData.branchId) || null
                  setCurrentBranch(branch)
                } else if (branchList.length > 0) {
                  setCurrentBranch(branchList[0])
                }
              } catch (err) {
                console.error('Error loading branches:', err)
              }
            }
          } else {
            // ── ไม่มีโปรไฟล์ผู้ใช้ = ยังไม่ได้รับสิทธิ์เข้าใช้งาน ──
            // ⚠️ SECURITY: ห้ามสร้าง user เป็น 'owner' อัตโนมัติ (เดิมทำแบบนั้น = ใครสมัคร
            // Firebase Auth ได้ก็กลายเป็นเจ้าของร้านทันที) ผู้ดูแลต้องเป็นคนสร้างผู้ใช้ให้ก่อน
            // ที่ ตั้งค่า → สิทธิ์การใช้งาน (เจ้าของร้านคนแรกตั้งค่า doc ผ่าน Firebase Console ครั้งเดียว)
            console.warn('No user profile for', fbUser.email, '— access denied, signing out')
            toast.error('บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
            setUser(null)
            setBranches([])
            setCurrentBranch(null)
            setLoading(false)
            await signOut(auth)
            return
          }
          setLoading(false)
        }, (err) => {
          console.error('User snapshot error:', err)
          setLoading(false)
        })
      } else {
        setUser(null)
        setBranches([])
        setCurrentBranch(null)
        setLoading(false)
      }
    })
}

export function useAuth() {
  const {
    user, firebaseUser, currentBranch, branches, isLoading, isAuthenticated,
    logout: storeLogout,
  } = useAuthStore()

  // เริ่ม listener ครั้งเดียวทั้งแอป (self-guard ภายใน)
  useEffect(() => {
    startAuthListener()
  }, [])

  const login = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password)
  }

  const logout = async () => {
    await signOut(auth)
    storeLogout()
  }

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    if (user.role === 'super_admin' || user.role === 'owner') return true
    return user.permissions?.includes(permission) ?? false
  }

  const canDiscount = (percent: number): boolean => {
    if (!user) return false
    if (user.role === 'super_admin' || user.role === 'owner') return true
    if (user.role === 'branch_manager') return percent <= 15
    if (user.role === 'sales') return percent <= 5
    return false
  }

  // Convenience helpers — falls back to demo values if not yet migrated
  const companyId  = user?.companyId  ?? 'demo_company'
  const branchId   = user?.branchId   ?? 'demo_branch'
  const userId     = user?.id         ?? 'demo_user'
  const userName   = user?.displayName ?? 'Demo User'

  return { user, firebaseUser, currentBranch, branches, isLoading, isAuthenticated, login, logout, hasPermission, canDiscount, companyId, branchId, userId, userName }
}
