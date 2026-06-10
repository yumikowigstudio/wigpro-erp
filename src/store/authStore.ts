import { create } from 'zustand'
import { User as FirebaseUser } from 'firebase/auth'
import { User, Branch } from '@/types'

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: User | null
  currentBranch: Branch | null
  branches: Branch[]
  isLoading: boolean
  isAuthenticated: boolean
  setFirebaseUser: (user: FirebaseUser | null) => void
  setUser: (user: User | null) => void
  setCurrentBranch: (branch: Branch | null) => void
  setBranches: (branches: Branch[]) => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  currentBranch: null,
  branches: [],
  isLoading: true,
  isAuthenticated: false,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser, isAuthenticated: !!firebaseUser }),
  setUser: (user) => set({ user }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setBranches: (branches) => set({ branches }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => set({ firebaseUser: null, user: null, currentBranch: null, isAuthenticated: false }),
}))
