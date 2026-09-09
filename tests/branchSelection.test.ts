import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { branchPreferenceKey, readPreferredBranch, rememberBranch, resolveBranchSelection } from '../src/lib/branchSelection'
import { useAuthStore } from '../src/store/authStore'
import type { Branch, User } from '../src/types'

const user = { id: 'owner-a', companyId: 'shop', branchId: 'main', role: 'owner' } as User
const main = { id: 'main', companyId: 'shop', status: 'active', isMainBranch: true } as Branch
const second = { ...main, id: 'second', isMainBranch: false }
const archived = { ...second, id: 'archived', status: 'archived' } as Branch
const foreign = { ...main, id: 'foreign', companyId: 'other-shop' }
const branches = [second, main, archived, foreign]
const initialState = useAuthStore.getState()
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

function fakeStorage() {
  const values = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true })
  return values
}

afterEach(() => {
  useAuthStore.setState(initialState, true)
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

test('owner preference wins over the assigned branch and survives a fresh in-memory state', () => {
  fakeStorage()
  useAuthStore.setState({ user, branches, currentBranch: main })
  useAuthStore.getState().setCurrentBranch(second)
  assert.equal(readPreferredBranch(user.id, user.companyId), 'second')
  useAuthStore.setState({ currentBranch: null })
  assert.equal(resolveBranchSelection(user, 'shop', branches, readPreferredBranch(user.id, 'shop'))?.id, 'second')
})

test('preferences are isolated by account and company, including support mode', () => {
  fakeStorage()
  rememberBranch(user.id, 'shop', 'second')
  rememberBranch(user.id, 'other-shop', 'foreign')
  rememberBranch('owner-b', 'shop', 'main')
  assert.equal(readPreferredBranch(user.id, 'shop'), 'second')
  assert.equal(readPreferredBranch(user.id, 'other-shop'), 'foreign')
  assert.equal(readPreferredBranch('owner-b', 'shop'), 'main')
  assert.notEqual(branchPreferenceKey('a:b', 'c'), branchPreferenceKey('a', 'b:c'))
})

test('deleted, inactive, and cross-company preferences fall back to an active allowed branch', () => {
  for (const preference of ['deleted', 'archived', 'foreign']) {
    assert.equal(resolveBranchSelection(user, 'shop', branches, preference)?.id, 'main')
  }
  assert.equal(resolveBranchSelection(user, 'shop', [second, archived], 'archived')?.id, 'second')
  assert.equal(resolveBranchSelection(user, 'shop', [archived, foreign], 'second'), null)
})

test('staff cannot restore an owner preference or fall back to a different branch', () => {
  const staff = { ...user, role: 'sales' as const }
  assert.equal(resolveBranchSelection(staff, 'shop', branches, 'second')?.id, 'main')
  assert.equal(resolveBranchSelection(staff, 'shop', [second, archived], 'second'), null)
})

test('support company uses its own saved branch or main branch, never the home branch', () => {
  const admin = { ...user, role: 'super_admin' as const }
  const otherSecond = { ...foreign, id: 'other-second', isMainBranch: false }
  assert.equal(resolveBranchSelection(admin, 'other-shop', [otherSecond, foreign], 'second')?.id, 'foreign')
  assert.equal(resolveBranchSelection(admin, 'other-shop', [otherSecond, foreign], 'other-second')?.id, 'other-second')
})

test('switch action validates branch membership and current role before persisting', () => {
  fakeStorage()
  useAuthStore.setState({ user: { ...user, role: 'sales' }, branches, currentBranch: main })
  useAuthStore.getState().setCurrentBranch(second)
  assert.equal(useAuthStore.getState().currentBranch?.id, 'main')
  assert.equal(readPreferredBranch(user.id, 'shop'), null)
  useAuthStore.setState({ user })
  for (const branch of [foreign, archived, { ...second, id: 'missing' }]) useAuthStore.getState().setCurrentBranch(branch)
  assert.equal(useAuthStore.getState().currentBranch?.id, 'main')
})

test('logout clears active state without losing the account-scoped preference', () => {
  fakeStorage()
  useAuthStore.setState({ user, branches, currentBranch: main })
  useAuthStore.getState().setCurrentBranch(second)
  useAuthStore.getState().logout()
  assert.equal(useAuthStore.getState().currentBranch, null)
  assert.equal(useAuthStore.getState().user, null)
  assert.equal(readPreferredBranch(user.id, 'shop'), 'second')
})

test('blocked storage does not crash authentication, branch switching, or logout', () => {
  Object.defineProperty(globalThis, 'window', { value: { get localStorage() { throw new Error('Storage blocked') } }, configurable: true })
  assert.equal(readPreferredBranch(user.id, 'shop'), null)
  assert.doesNotThrow(() => rememberBranch(user.id, 'shop', 'second'))
  useAuthStore.setState({ user, branches, currentBranch: main })
  useAuthStore.getState().setCurrentBranch(second)
  assert.equal(useAuthStore.getState().currentBranch?.id, 'second')
  assert.doesNotThrow(() => useAuthStore.getState().logout())
})
