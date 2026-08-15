export type CatalogScope = 'shared' | 'branch'

export interface CatalogScopedItem {
  branchId?: string
  sourceBranchId?: string
  catalogScope?: CatalogScope
  visibleBranchIds?: string[]
  excludedBranchIds?: string[]
  status?: string
  isActive?: boolean
  stockQty?: number
}

export interface CatalogBranch {
  id: string
  name?: string
  code?: string
  isMainBranch?: boolean
  status?: string
}

const normalize = (value?: string) => value?.trim().toLowerCase() ?? ''

export function getActiveBranchIds(branches: CatalogBranch[], fallbackBranchId?: string) {
  const ids = branches
    .filter(branch => branch.status !== 'inactive' && branch.status !== 'deleted')
    .map(branch => branch.id)
    .filter(Boolean)

  if (fallbackBranchId && !ids.includes(fallbackBranchId)) ids.push(fallbackBranchId)
  return Array.from(new Set(ids))
}

export function findCatalogMainBranch(
  branches: CatalogBranch[],
  fallbackBranchId?: string
) {
  const activeBranches = branches.filter(branch => branch.status !== 'inactive' && branch.status !== 'deleted')
  const yumikoMain = activeBranches.find(branch =>
    branch.isMainBranch && normalize(branch.name).includes('yumiko wig studio')
  )
  if (yumikoMain) return yumikoMain

  const yumikoNamed = activeBranches.find(branch => normalize(branch.name).includes('yumiko wig studio'))
  if (yumikoNamed) return yumikoNamed

  const flaggedMain = activeBranches.find(branch => branch.isMainBranch)
  if (flaggedMain) return flaggedMain

  return activeBranches.find(branch => branch.id === fallbackBranchId) ?? activeBranches[0] ?? null
}

export function buildCatalogScopeFields(
  branchId: string,
  branchIds: string[],
  isMainCatalogBranch: boolean
) {
  const fallbackBranchIds = branchIds.length > 0 ? branchIds : [branchId]
  return isMainCatalogBranch
    ? {
        branchId,
        sourceBranchId: branchId,
        catalogScope: 'shared' as CatalogScope,
        visibleBranchIds: fallbackBranchIds,
        excludedBranchIds: [],
      }
    : {
        branchId,
        sourceBranchId: branchId,
        catalogScope: 'branch' as CatalogScope,
        visibleBranchIds: [branchId],
        excludedBranchIds: [],
      }
}

export function isMainCatalogSource(item: CatalogScopedItem, mainBranchId?: string) {
  if (item.status === 'deleted' || item.status === 'archived' || item.isActive === false) return false
  if (item.catalogScope === 'shared') return true
  if (!mainBranchId) return !item.branchId || item.branchId === 'main'
  if (!item.branchId || item.branchId === 'main') return true
  return item.branchId === mainBranchId || item.sourceBranchId === mainBranchId
}

export function isCatalogVisibleInBranch(
  item: CatalogScopedItem,
  currentBranchId: string,
  mainBranchId?: string
) {
  if (!currentBranchId) return false
  if (item.status === 'deleted' || item.status === 'archived' || item.isActive === false) return false
  if (item.excludedBranchIds?.includes(currentBranchId)) return false
  if (item.visibleBranchIds?.includes(currentBranchId)) return true

  if (item.catalogScope === 'shared') return !item.visibleBranchIds || item.visibleBranchIds.length === 0
  if (item.catalogScope === 'branch') {
    return item.branchId === currentBranchId || item.sourceBranchId === currentBranchId
  }

  if (!item.branchId || item.branchId === 'main') return true
  if (item.branchId === currentBranchId || item.sourceBranchId === currentBranchId) return true
  return !!mainBranchId && (item.branchId === mainBranchId || item.sourceBranchId === mainBranchId)
}

export function getLegacyBranchStockFallback(
  item: CatalogScopedItem,
  currentBranchId: string,
  mainBranchId?: string
) {
  const stockQty = Number(item.stockQty ?? 0)
  if (!stockQty || !currentBranchId) return 0
  if (item.branchId === currentBranchId || item.sourceBranchId === currentBranchId) return stockQty
  if ((!item.branchId || item.branchId === 'main') && (!mainBranchId || currentBranchId === mainBranchId)) {
    return stockQty
  }
  return 0
}
