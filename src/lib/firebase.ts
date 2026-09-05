import { initializeApp, getApps, getApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const isNewApp = getApps().length === 0
const app = isNewApp ? initializeApp(firebaseConfig) : getApp()

export const auth = getAuth(app)
export const db = getFirestore(app)

if (isNewApp && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true' && firebaseConfig.projectId?.startsWith('demo-')) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9096', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8086)
}

export const storage = getStorage(app)

export default app
