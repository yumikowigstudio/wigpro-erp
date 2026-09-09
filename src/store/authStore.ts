import { create } from 'zustand'
import { User as FirebaseUser } from 'firebase/auth'
import { User, Branch } from '@/types'
import { rememberBranch } from '@/lib/branchSelection'

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: User | null
  currentBranch: Branch | null
  branches: Branch[]
  supportCompanyId: string
  supportCompanyName: string
  isLoading: boolean
  isBranchLoading: boolean
  branchError: string
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

function readSupportSetting(key: string): string {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(key) ?? '' : '' }
  catch { return '' }
}

function saveSupportSettings(companyId = '', companyName = '') {
  try {
    if (typeof window === 'undefined') return
    if (companyId) {
      window.localStorage.setItem('supportCompanyId', companyId)
      window.localStorage.setItem('supportCompanyName', companyName)
    } else {
      window.localStorage.removeItem('supportCompanyId')
      window.localStorage.removeItem('supportCompanyName')
    }
  } catch { /* Support mode remains usable when browser storage is blocked. */ }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  user: null,
  currentBranch: null,
  branches: [],
  supportCompanyId: readSupportSetting('supportCompanyId'),
  supportCompanyName: readSupportSetting('supportCompanyName'),
  isLoading: true,
  isBranchLoading: false,
  branchError: '',
  isAuthenticated: false,
  setFirebaseUser: (firebaseUser) => set({ firebaseUser, isAuthenticated: !!firebaseUser }),
  setUser: (user) => set({ user }),
  setCurrentBranch: (currentBranch) => {
    if (!currentBranch) { set({ currentBranch: null }); return }
    const { user, branches, supportCompanyId } = get()
    if (!user) return
    const companyId = user.role === 'super_admin' && supportCompanyId ? supportCompanyId : user.companyId
    const branch = branches.find(item => item.id === currentBranch.id && item.companyId === companyId && item.status === 'active')
    if (!branch || (!['owner', 'super_admin'].includes(user.role) && branch.id !== user.branchId)) return
    rememberBranch(user.id, companyId, branch.id)
    set({ currentBranch: branch })
  },
  setBranches: (branches) => set({ branches }),
  setSupportCompany: (supportCompanyId, supportCompanyName) => {
    saveSupportSettings(supportCompanyId, supportCompanyName)
    set({ supportCompanyId, supportCompanyName, currentBranch: null, branches: [] })
  },
  clearSupportCompany: () => {
    saveSupportSettings()
    set({ supportCompanyId: '', supportCompanyName: '', currentBranch: null, branches: [] })
  },
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    saveSupportSettings()
    set({ firebaseUser: null, user: null, currentBranch: null, branches: [], supportCompanyId: '', supportCompanyName: '', isAuthenticated: false, isBranchLoading: false, branchError: '' })
  },
}))
