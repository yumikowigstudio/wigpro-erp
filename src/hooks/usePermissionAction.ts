'use client'

import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/firestore'
import { PermissionKey } from '@/lib/permissions'
import { useAuth } from '@/hooks/useAuth'

export function usePermissionAction() {
  const { user, userId, companyId, hasPermission } = useAuth()

  const ensurePermission = async (permission: PermissionKey, label: string) => {
    if (hasPermission(permission)) return true
    if (!user || !companyId) return false

    try {
      await addDoc(collection(db, COLLECTIONS.PERMISSION_REQUESTS), {
        companyId,
        userId,
        userEmail: user.email,
        userName: user.displayName,
        permission,
        label,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      alert(`บัญชีนี้ยังไม่มีสิทธิ์ "${label}" ระบบส่งคำขอไปให้เจ้าของร้านแล้ว`)
    } catch (err) {
      console.error('Permission request error:', err)
      alert(`บัญชีนี้ยังไม่มีสิทธิ์ "${label}" และส่งคำขอไม่ได้ กรุณาให้เจ้าของร้านเปิดสิทธิ์ที่ ตั้งค่า > สิทธิ์การใช้งาน`)
    }
    return false
  }

  return { ensurePermission, hasPermission }
}
