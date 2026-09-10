import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCatalogScopeFields,
  findCatalogMainBranch,
  getActiveBranchIds,
  isCatalogVisibleInBranch,
  canArchiveCatalogItem,
} from '../src/lib/catalogScope'

const branches = [
  { id: 'main', name: 'Yumiko Wig Studio สาขาหลัก', isMainBranch: true, status: 'active' },
  { id: 'branch-a', name: 'บางนา', status: 'active' },
  { id: 'closed', name: 'สาขาเก่า', status: 'archived' },
]

test('the Yumiko main branch is the shared catalog owner', () => {
  assert.equal(findCatalogMainBranch(branches, 'branch-a')?.id, 'main')
  assert.deepEqual(getActiveBranchIds(branches), ['main', 'branch-a'])
})

test('items created at the main branch are visible at every active branch', () => {
  const item = buildCatalogScopeFields('main', getActiveBranchIds(branches), true)
  assert.equal(item.catalogScope, 'shared')
  assert.equal(isCatalogVisibleInBranch(item, 'main', 'main'), true)
  assert.equal(isCatalogVisibleInBranch(item, 'branch-a', 'main'), true)
  assert.equal(isCatalogVisibleInBranch(item, 'new-branch', 'main'), true, 'New branches inherit the central catalog automatically')
})

test('items created by a subbranch stay in that branch', () => {
  const item = buildCatalogScopeFields('branch-a', getActiveBranchIds(branches), false)
  assert.equal(item.catalogScope, 'branch')
  assert.equal(isCatalogVisibleInBranch(item, 'branch-a', 'main'), true)
  assert.equal(isCatalogVisibleInBranch(item, 'main', 'main'), false)
})

test('archived catalog items are hidden from every branch', () => {
  const item = { ...buildCatalogScopeFields('main', ['main', 'branch-a'], true), status: 'archived' }
  assert.equal(isCatalogVisibleInBranch(item, 'main', 'main'), false)
  assert.equal(isCatalogVisibleInBranch(item, 'branch-a', 'main'), false)
})

test('catalog archiving is limited to the source branch and cannot select archived items', () => {
  const shared = buildCatalogScopeFields('main', ['main', 'branch-a'], true)
  const local = buildCatalogScopeFields('branch-a', ['main', 'branch-a'], false)
  assert.equal(canArchiveCatalogItem(shared, 'main', 'main'), true)
  assert.equal(canArchiveCatalogItem(shared, 'branch-a', 'main'), false)
  assert.equal(canArchiveCatalogItem(local, 'main', 'main'), false)
  assert.equal(canArchiveCatalogItem(local, 'branch-a', 'main'), true)
  assert.equal(canArchiveCatalogItem({ ...shared, status: 'archived' }, 'main', 'main'), false)
})
