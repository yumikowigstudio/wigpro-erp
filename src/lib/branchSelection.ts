import type { Branch, User } from '@/types'

type BranchUser = Pick<User, 'id' | 'companyId' | 'branchId' | 'role'>

export const branchPreferenceKey = (userId: string, companyId: string) =>
  `yumiko:branch:v1:${encodeURIComponent(userId)}:${encodeURIComponent(companyId)}`

export function readPreferredBranch(userId: string, companyId: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(branchPreferenceKey(userId, companyId))
  } catch {
    return null
  }
}

export function rememberBranch(userId: string, companyId: string, branchId: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(branchPreferenceKey(userId, companyId), branchId)
  } catch {
    // A blocked browser store must not prevent a valid branch from being used.
  }
}

export function resolveBranchSelection(user: BranchUser, companyId: string, branches: Branch[], preferredId?: string | null): Branch | null {
  const available = branches.filter(branch => branch.companyId === companyId && branch.status === 'active')
  if (!['owner', 'super_admin'].includes(user.role)) {
    return available.find(branch => branch.id === user.branchId) ?? null
  }
  return available.find(branch => branch.id === preferredId)
    ?? available.find(branch => companyId === user.companyId && branch.id === user.branchId)
    ?? available.find(branch => branch.isMainBranch)
    ?? available[0]
    ?? null
}
