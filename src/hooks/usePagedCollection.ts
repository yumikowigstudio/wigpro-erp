'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { convertTimestamps } from '@/lib/firestore'

export function usePagedCollection<T extends { id: string }>(name: string, companyId: string, options: { branchId?: string; pageSize?: number; from?: string; to?: string } = {}) {
  const { branchId, pageSize = 40, from = '', to = '' } = options
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)
  const version = useRef(0)
  const busy = useRef(false)
  const constraints = useCallback(() => [
    where('companyId', '==', companyId), ...(branchId ? [where('branchId', '==', branchId)] : []),
    ...(from ? [where('createdAt', '>=', new Date(`${from}T00:00:00`))] : []),
    ...(to ? [where('createdAt', '<=', new Date(`${to}T23:59:59.999`))] : []), orderBy('createdAt', 'desc'),
  ], [companyId, branchId, from, to])
  useEffect(() => {
    const generation = ++version.current
    setItems([]); cursor.current = null; setError(''); setLoading(true); setLoadingMore(false); setHasMore(false); busy.current = false
    if (!companyId || companyId === 'demo_company') { setLoading(false); return }
    return onSnapshot(query(collection(db, name), ...constraints(), limit(pageSize)), snap => {
      if (generation !== version.current) return
      const first = snap.docs.map(record => ({ id: record.id, ...convertTimestamps(record.data()) } as T))
      setItems(current => [...first, ...current.filter(item => !first.some(newItem => newItem.id === item.id))])
      if (!cursor.current) { cursor.current = snap.docs.at(-1) ?? null; setHasMore(snap.size === pageSize) }
      setLoading(false)
    }, failure => { setError(failure.message); setLoading(false) })
  }, [name, companyId, pageSize, constraints, refresh])
  const loadMore = async () => {
    if (!cursor.current && error) { setRefresh(value => value + 1); return }
    if (!cursor.current || busy.current || !hasMore) return
    busy.current = true; setLoadingMore(true); setError('')
    const generation = version.current
    try {
      const snap = await getDocs(query(collection(db, name), ...constraints(), startAfter(cursor.current), limit(pageSize)))
      if (generation !== version.current) return
      setItems(current => [...current, ...snap.docs.filter(record => !current.some(item => item.id === record.id)).map(record => ({ id: record.id, ...convertTimestamps(record.data()) } as T))])
      cursor.current = snap.docs.at(-1) ?? cursor.current
      setHasMore(snap.size === pageSize)
    } catch (failure) { if (generation === version.current) setError(failure instanceof Error ? failure.message : 'โหลดข้อมูลไม่สำเร็จ') }
    finally { if (generation === version.current) { busy.current = false; setLoadingMore(false) } }
  }
  return { items, loading, loadingMore, hasMore, loadMore, error }
}
