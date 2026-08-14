import { create } from 'zustand'
import { User as FirebaseUser } from 'firebase/auth'
import { User, Branch } from '@/types'

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: User | null
  currentBranch: Branch | null
  branches: Branch[]
  supportCompanyId: string
  supportCompanyName: string
  isLoading: boolean
  isAuthenticated: boolean
  setFirebaseUser: (user: FirebaseUser | null) => void
  setUser: (user: User | null) => void
  setCurrentBranch: (branch: Branch | null) => void
  setBranches: (branches: Branch[]) => void
  setSupportCompany: (companyId: string, companyName: string) => void
  clearSupportCompany: () => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  currentBranch: null,
  branches: [],
  supportCompanyId: typeof window !== 'undefined' ? localStorage.getItem('supportCompanyId') ?? '' : '',
  supportCompanyName: typeof window !== 'undefined' ? localStorage.getItem('supportCompanyName') ?? '' : '',
  isLoading: true,
  isAuthenticated: false,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser, isAuthenticated: !!firebaseUser }),
  setUser: (user) => set({ user }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  setBranches: (branches) => set({ branches }),
  setSupportCompany: (supportCompanyId, supportCompanyName) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('supportCompanyId', supportCompanyId)
      localStorage.setItem('supportCompanyName', supportCompanyName)
    }
    set({ supportCompanyId, supportCompanyName, currentBranch: null, branches: [] })
  },
  clearSupportCompany: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('supportCompanyId')
      localStorage.removeItem('supportCompanyName')
    }
    set({ supportCompanyId: '', supportCompanyName: '', currentBranch: null, branches: [] })
  },
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('supportCompanyId')
      localStorage.removeItem('supportCompanyName')
    }
    set({ firebaseUser: null, user: null, currentBranch: null, branches: [], supportCompanyId: '', supportCompanyName: '', isAuthenticated: false })
  },
}))
