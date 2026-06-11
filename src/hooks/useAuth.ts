'use client'
import { useEffect } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp, getDocs, collection, query, where as fsWhere, limit, orderBy } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { getCollection, COLLECTIONS, where } from '@/lib/firestore'
import { useAuthStore } from '@/store/authStore'
import { User, Branch } from '@/types'

export function useAuth() {
  const {
    user, firebaseUser, currentBranch, branches, isLoading, isAuthenticated,
    setFirebaseUser, setUser, setCurrentBranch, setBranches, setLoading, logout: storeLogout
  } = useAuthStore()

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
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
            if (branches.length === 0) {
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
            // ── Auto-bootstrap: user logged in via Firebase Auth แต่ยังไม่มี Firestore user doc ──
            // หา company + branch แรกที่มีในระบบ แล้วสร้าง user doc อัตโนมัติ
            try {
              // หา company แรก
              const companySnap = await getDocs(query(collection(db, COLLECTIONS.COMPANIES), limit(1)))
              let autoCompanyId = 'company001'
              if (!companySnap.empty) autoCompanyId = companySnap.docs[0].id

              // หา branch แรกของ company นั้น
              const branchSnap = await getDocs(query(
                collection(db, COLLECTIONS.BRANCHES),
                fsWhere('companyId', '==', autoCompanyId),
                orderBy('createdAt'),
                limit(1),
              ))
              let autoBranchId = ''
              if (!branchSnap.empty) autoBranchId = branchSnap.docs[0].id

              // สร้าง user document
              const newUserData = {
                email:       fbUser.email   ?? '',
                displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'Admin',
                role:        'owner' as const,
                companyId:   autoCompanyId,
                branchId:    autoBranchId,
                isActive:    true,
                permissions: [],
                createdAt:   serverTimestamp(),
                updatedAt:   serverTimestamp(),
              }
              await setDoc(doc(db, COLLECTIONS.USERS, fbUser.uid), newUserData)
              console.log('✅ Auto-created user document for', fbUser.email, '→ companyId:', autoCompanyId)
              // onSnapshot จะ trigger อีกครั้งหลัง setDoc สำเร็จ
            } catch (err) {
              console.error('Auto-bootstrap user error:', err)
              setUser(null)
              setLoading(false)
            }
            return // รอ onSnapshot trigger ใหม่
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

    return () => {
      unsubscribeAuth()
      if (unsubscribeUser) unsubscribeUser()
    }
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
