'use client'
import { useCallback, useEffect } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp, collection, addDoc, query, where } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { getEffectivePermissions, PermissionKey } from '@/lib/permissions'
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
  let profileLoadTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeBranches: (() => void) | null = null
  let branchScope = ''

  // Every menu uses useAuth; keep one branch subscription for the active account.
  const syncBranches = () => {
    const { user, supportCompanyId } = useAuthStore.getState()
    const isSupport = user?.role === 'super_admin' && !!supportCompanyId
    const companyId = isSupport ? supportCompanyId : user?.companyId
    const nextScope = user && companyId ? JSON.stringify([user.id, companyId, user.branchId, user.role, isSupport]) : ''
    if (nextScope === branchScope) return
    branchScope = nextScope
    unsubscribeBranches?.()
    unsubscribeBranches = null
    if (!user || !companyId) return
    unsubscribeBranches = onSnapshot(query(collection(db, COLLECTIONS.BRANCHES),
      where('companyId', '==', companyId), where('status', '==', 'active')),
    snapshot => {
      if (branchScope !== nextScope) return
      const branchList = snapshot.docs.map(branch => ({ id: branch.id, ...branch.data() })) as Branch[]
      const selectedBranchId = ['super_admin', 'owner'].includes(user.role)
        ? useAuthStore.getState().currentBranch?.id : user.branchId
      const preferredBranchId = isSupport ? branchList[0]?.id : user.branchId
      const branch = branchList.find(item => item.id === selectedBranchId)
        || branchList.find(item => item.id === preferredBranchId) || branchList[0] || null
      useAuthStore.setState({ branches: branchList, currentBranch: branch })
    }, error => {
      if (branchScope !== nextScope) return
      console.error('Error loading branches:', error)
      useAuthStore.setState({ branches: [], currentBranch: null })
      toast.error('โหลดสาขาไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วเข้าสู่ระบบใหม่')
    })
  }
  useAuthStore.subscribe(syncBranches)
  syncBranches()

  const clearProfileLoadTimer = () => {
    if (profileLoadTimer) {
      clearTimeout(profileLoadTimer)
      profileLoadTimer = null
    }
  }

  onAuthStateChanged(auth, async (fbUser) => {
      clearProfileLoadTimer()
      setFirebaseUser(fbUser)

      // ยกเลิก listener เก่าถ้ามี
      if (unsubscribeUser) {
        unsubscribeUser()
        unsubscribeUser = null
      }

      if (fbUser) {
        // ใช้ onSnapshot แทน getDoc — จะ update อัตโนมัติเมื่อ Firestore เปลี่ยน
        const userRef = doc(db, COLLECTIONS.USERS, fbUser.uid)
        profileLoadTimer = setTimeout(() => {
          console.error('User profile load timeout:', fbUser.email)
          toast.error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วเข้าสู่ระบบใหม่')
          setUser(null)
          setBranches([])
          setCurrentBranch(null)
          setLoading(false)
          signOut(auth).catch(console.error)
        }, 15000)
        unsubscribeUser = onSnapshot(userRef, async (snap) => {
          clearProfileLoadTimer()
          if (snap.exists()) {
            const userData = { id: snap.id, ...snap.data() } as User

            // แปลง Timestamp เป็น Date
            if (userData.isActive === false) {
              toast.error('บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ')
              setUser(null)
              setBranches([])
              setCurrentBranch(null)
              setLoading(false)
              await signOut(auth)
              return
            }

            const ud = userData as unknown as Record<string, unknown>
            if (ud.createdAt && typeof ud.createdAt === 'object') {
              const ts = ud.createdAt as { toDate?: () => Date }
              if (ts.toDate) ud.createdAt = ts.toDate()
            }

            setUser(userData)
          } else {
            // ── ไม่มีโปรไฟล์ผู้ใช้ ──
            const founderEmail = (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL || 'yumikosystem@gmail.com').toLowerCase()
            if (fbUser.email && fbUser.email.toLowerCase() === founderEmail) {
              // ── ตั้งเจ้าของระบบคนแรก (founder) อัตโนมัติ — เฉพาะอีเมลนี้เท่านั้น ──
              // (คนอื่นที่ไม่มีโปรไฟล์จะถูกเซ็นเอาต์ ไม่กลายเป็น admin)
              try {
                await setDoc(doc(db, COLLECTIONS.USERS, fbUser.uid), {
                  email: fbUser.email, displayName: fbUser.displayName ?? 'Super Admin',
                  role: 'super_admin', companyId: '', branchId: '', isActive: true, permissions: [],
                  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                })
                const companyRef = await addDoc(collection(db, COLLECTIONS.COMPANIES), {
                  name: 'ร้านของฉัน', status: 'active', ownerEmail: fbUser.email, createdAt: serverTimestamp(),
                })
                const branchRef = await addDoc(collection(db, COLLECTIONS.BRANCHES), {
                  companyId: companyRef.id, name: 'สาขาหลัก', code: '01', isMainBranch: true, status: 'active', createdAt: serverTimestamp(),
                })
                await setDoc(doc(db, COLLECTIONS.SYSTEM_SETTINGS, companyRef.id), { nameTh: 'ร้านของฉัน', createdAt: serverTimestamp() }, { merge: true })
                await setDoc(doc(db, COLLECTIONS.USERS, fbUser.uid), { companyId: companyRef.id, branchId: branchRef.id, updatedAt: serverTimestamp() }, { merge: true })
                console.log('✅ Founder super_admin bootstrapped:', fbUser.email)
                return // onSnapshot จะ trigger ใหม่พร้อมโปรไฟล์
              } catch (e) {
                console.error('Founder bootstrap error:', e)
                toast.error('ตั้งค่าเจ้าของระบบไม่สำเร็จ: ' + (e instanceof Error ? e.message : ''))
                setUser(null); setLoading(false); await signOut(auth); return
              }
            }
            // ไม่ใช่ founder → ปฏิเสธ (กันบัญชีสมัครใหม่ยกระดับเป็นเจ้าของ)
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
          clearProfileLoadTimer()
          console.error('User snapshot error:', err)
          setLoading(false)
        })
      } else {
        clearProfileLoadTimer()
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
    supportCompanyId, supportCompanyName, setCurrentBranch,
    setSupportCompany, clearSupportCompany, logout: storeLogout,
  } = useAuthStore()

  // เริ่ม listener ครั้งเดียวทั้งแอป (self-guard ภายใน)
  useEffect(() => {
    startAuthListener()
  }, [])

  const login = async (email: string, password: string) => {
    useAuthStore.getState().setLoading(true)
    try {
      return await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      useAuthStore.getState().setLoading(false)
      throw error
    }
  }

  const logout = async () => {
    await signOut(auth)
    storeLogout()
  }

  const isSupportMode = !!user && user.role === 'super_admin' && !!supportCompanyId
  const companyId = isSupportMode ? supportCompanyId : user?.companyId ?? ''

  const enterSupportCompany = (nextCompanyId: string, nextCompanyName: string) => {
    if (user?.role !== 'super_admin') return
    setSupportCompany(nextCompanyId, nextCompanyName)
  }

  const exitSupportCompany = () => {
    clearSupportCompany()
  }

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false
    if (user.role === 'super_admin' || user.role === 'owner') return true
    return getEffectivePermissions(user.role, user.permissions).includes(permission as PermissionKey)
  }, [user])

  const canDiscount = (percent: number): boolean => {
    if (!user) return false
    if (user.role === 'super_admin' || user.role === 'owner') return true
    if (user.role === 'branch_manager') return percent <= 15
    if (user.role === 'sales') return percent <= 5
    return false
  }

  const canSwitchBranch = !!user && ['super_admin', 'owner'].includes(user.role)
  const switchBranch = (nextBranchId: string) => {
    if (!canSwitchBranch) return
    const nextBranch = branches.find(branch => branch.id === nextBranchId) || null
    if (nextBranch) setCurrentBranch(nextBranch)
  }

  // Convenience helpers
  const branchId   = (canSwitchBranch ? currentBranch?.id : user?.branchId) ?? user?.branchId ?? ''
  const userId     = user?.id         ?? ''
  const userName   = user?.displayName ?? ''

  return {
    user, firebaseUser, currentBranch, branches, isLoading, isAuthenticated,
    login, logout, hasPermission, canDiscount, canSwitchBranch, switchBranch,
    companyId, branchId, userId, userName,
    isSupportMode, supportCompanyId, supportCompanyName, enterSupportCompany, exitSupportCompany,
  }
}
