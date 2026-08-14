import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// สร้างบัญชี Firebase Auth ใหม่ โดย "ไม่" กระทบ session ที่ล็อกอินอยู่
// (createUserWithEmailAndPassword ปกติจะสลับไปล็อกอินเป็นบัญชีใหม่ทันที —
//  เราจึงสร้างบน app instance รองแล้วทิ้ง เพื่อให้ super admin ยัง login เดิม)
export async function createAuthUser(email: string, password: string): Promise<string> {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`)
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(secondary), email, password)
    return cred.user.uid
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code !== 'auth/email-already-in-use') throw error

    const cred = await signInWithEmailAndPassword(getAuth(secondary), email, password)
    return cred.user.uid
  } finally {
    await deleteApp(secondary).catch(() => {})
  }
}
