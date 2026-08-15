'use client'
/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { addDocument, COLLECTIONS } from '@/lib/firestore'
import { formatCurrency } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { invId } from '@/lib/stock'
import {
  buildCatalogScopeFields,
  findCatalogMainBranch,
  getActiveBranchIds,
  isCatalogVisibleInBranch,
} from '@/lib/catalogScope'
import {
  parseCsvRows,
  parseProductImportRows,
  productTemplateRowsToSheet,
  PRODUCT_IMPORT_MAX_ROWS,
} from '@/lib/productImport'
import {
  parseServiceImportRows,
  serviceTemplateRowsToSheet,
  SERVICE_IMPORT_MAX_ROWS,
} from '@/lib/serviceImport'
import {
  Plus, Search, Package, Eye, Edit, X, Loader2,
  Tag, Trash2, ImagePlus, FolderOpen, Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Scissors, Clock,
} from 'lucide-react'
import Link from 'next/link'
import type { Product, Service } from '@/types'
import type { SheetData } from 'read-excel-file/browser'
import type { SheetData as WritableSheetData } from 'write-excel-file/browser'

/* ─── Types ─── */
interface Category { id: string; name: string; icon: string; companyId: string }

interface ProductForm {
  name: string; sku: string; category: string
  sellingPrice: string; costPrice: string; minStockAlert: string
  isWigProduct: boolean; description: string
}

interface ServiceForm {
  name: string
  code: string
  category: string
  price: string
  duration: string
  commissionRate: string
  commissionAmount: string
  notes: string
}

interface ImportSummary {
  fileName: string
  imported: number
  skipped: number
  categoriesCreated: number
  errors: string[]
  warnings: string[]
}

const defaultForm: ProductForm = {
  name: '', sku: '', category: '',
  sellingPrice: '', costPrice: '', minStockAlert: '',
  isWigProduct: false, description: '',
}

const defaultServiceForm: ServiceForm = {
  name: '',
  code: '',
  category: 'บริการทั่วไป',
  price: '',
  duration: '30',
  commissionRate: '',
  commissionAmount: '',
  notes: '',
}

function compactObject<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T
}

const inputCls = 'w-full px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pink-200)] border border-[var(--border-light)] transition-all'

const EMOJI_OPTIONS = ['📦','👗','💇','✂️','🎀','💄','🪮','🛍️','🎁','⭐','💎','🌸']

const CLOUDINARY_CLOUD = 'dqea32qab'
const CLOUDINARY_PRESET = 'wigpro_products'

async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_PRESET)
  fd.append('folder', 'wigpro/products')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('Upload failed')
  const data = await res.json()
  return data.secure_url as string
}

/* ─── Category Modal ─── */
function CategoryModal({
  categories,
  companyId,
  onClose,
  collectionName = 'product_categories',
  title = 'จัดการหมวดหมู่สินค้า',
  addLabel = 'เพิ่มหมวดหมู่ใหม่',
  placeholder = 'ชื่อหมวดหมู่ เช่น วิก, อุปกรณ์...',
  emptyText = 'ยังไม่มีหมวดหมู่ — เพิ่มด้านบนได้เลย',
  defaultIcon = '📦',
}: {
  categories: Category[]
  companyId: string
  onClose: () => void
  collectionName?: string
  title?: string
  addLabel?: string
  placeholder?: string
  emptyText?: string
  defaultIcon?: string
}) {
  const [name, setName]   = useState('')
  const [icon, setIcon]   = useState(defaultIcon)
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, collectionName), {
        name: name.trim(), icon, companyId, createdAt: serverTimestamp(),
      })
      setName(''); setIcon(defaultIcon)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบหมวดหมู่นี้?')) return
    setDeleting(id)
    try { await deleteDoc(doc(db, collectionName, id)) }
    finally { setDeleting(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-[var(--pink-500)]" />
            <h2 className="font-bold text-[var(--text-primary)]">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-[var(--bg-base)]"><X className="w-4 h-4 text-[var(--text-muted)]" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Add new */}
          <div className="bg-[var(--bg-base)] rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">{addLabel}</p>
            <div className="flex gap-2">
              {/* Emoji picker */}
              <div className="relative group">
                <button type="button" className="w-10 h-10 text-xl rounded-xl border border-[var(--border-light)] bg-white hover:bg-[var(--pink-50)] transition-all flex items-center justify-center">
                  {icon}
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white border border-[var(--border-light)] rounded-2xl shadow-lg p-2 grid grid-cols-6 gap-1 z-10 hidden group-focus-within:grid group-hover:grid">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} type="button" onClick={() => setIcon(e)}
                      className={`w-8 h-8 text-lg rounded-lg hover:bg-[var(--pink-50)] transition-all ${icon===e ? 'bg-[var(--pink-100)]' : ''}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder={placeholder} className={inputCls + ' flex-1'}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              <button onClick={handleAdd} disabled={saving || !name.trim()}
                className="px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-bold disabled:opacity-40 whitespace-nowrap">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '+ เพิ่ม'}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {categories.length === 0 && (
              <p className="text-center text-sm text-[var(--text-muted)] py-4">{emptyText}</p>
            )}
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[var(--border-light)] hover:border-[var(--pink-200)] transition-all">
                <span className="text-xl w-8 text-center">{cat.icon}</span>
                <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{cat.name}</span>
                <button onClick={() => handleDelete(cat.id)} disabled={deleting === cat.id}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 transition-all">
                  {deleting === cat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>

          <button onClick={onClose}
            className="w-full py-2.5 border border-[var(--border-light)] rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-base)]">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function ProductsPage() {
  const { companyId, branchId, userId, branches } = useAuth()
  const [catalogTab, setCatalogTab] = useState<'products' | 'services'>('products')
  const [products, setProducts]     = useState<Product[]>([])
  const [services, setServices]     = useState<Service[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [serviceCategoriesData, setServiceCategoriesData] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [servicesLoading, setServicesLoading] = useState(true)
  const [search, setSearch]         = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [serviceFilterCategory, setServiceFilterCategory] = useState('')
  const [filterWig, setFilterWig]   = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [showServiceCatModal, setShowServiceCatModal] = useState(false)
  const [form, setForm]             = useState<ProductForm>(defaultForm)
  const [serviceForm, setServiceForm] = useState<ServiceForm>(defaultServiceForm)
  const [submitting, setSubmitting] = useState(false)
  const [serviceSubmitting, setServiceSubmitting] = useState(false)
  const [errors, setErrors]         = useState<Partial<ProductForm>>({})
  const [serviceErrors, setServiceErrors] = useState<Partial<ServiceForm>>({})
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [serviceImporting, setServiceImporting] = useState(false)
  const [serviceImportSummary, setServiceImportSummary] = useState<ImportSummary | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const serviceImportFileRef = useRef<HTMLInputElement>(null)
  const mainCatalogBranch = findCatalogMainBranch(branches, branchId)
  const mainCatalogBranchId = mainCatalogBranch?.id ?? branchId
  const isMainCatalogBranch = branchId === mainCatalogBranchId
  const catalogBranchIds = getActiveBranchIds(branches, branchId)

  /* Load products */
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.PRODUCTS), where('companyId', '==', companyId), where('status', '!=', 'deleted'))
    return onSnapshot(q, snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)))
      setLoading(false)
    }, () => setLoading(false))
  }, [companyId])

  /* Load services */
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.SERVICES), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Service)))
      setServicesLoading(false)
    }, () => setServicesLoading(false))
  }, [companyId])

  /* Load categories */
  useEffect(() => {
    const q = query(collection(db, 'product_categories'), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)))
    })
  }, [companyId])

  /* Load service categories */
  useEffect(() => {
    const q = query(collection(db, 'service_categories'), where('companyId', '==', companyId))
    return onSnapshot(q, snap => {
      setServiceCategoriesData(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)))
    })
  }, [companyId])

  const allCategoryNames = categories.map(c => c.name)
  const visibleProducts = products.filter(p => isCatalogVisibleInBranch(p, branchId, mainCatalogBranchId))
  const visibleServices = services.filter(s => isCatalogVisibleInBranch(s, branchId, mainCatalogBranchId))
  const categoriesFromProducts = Array.from(new Set(visibleProducts.map(p => p.category).filter(Boolean)))
  const allCategories = Array.from(new Set([...allCategoryNames, ...categoriesFromProducts]))
  const serviceCategoryNamesFromData = serviceCategoriesData.map(c => c.name)
  const serviceCategoriesFromServices = Array.from(new Set(visibleServices.map(s => s.category).filter(Boolean)))
  const serviceCategories = Array.from(new Set([...serviceCategoryNamesFromData, ...serviceCategoriesFromServices]))

  const filtered = visibleProducts.filter(p => {
    const q = search.toLowerCase()
    return (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      && (!filterCategory || p.category === filterCategory)
      && (filterWig === '' || (filterWig === 'wig' ? p.isWigProduct : !p.isWigProduct))
  })
  const filteredServices = visibleServices.filter(s => {
    const q = search.toLowerCase()
    return (!q || s.name.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q))
      && (!serviceFilterCategory || s.category === serviceFilterCategory)
      && s.status !== 'deleted'
      && s.isActive !== false
  })

  const margin = (p: Product) =>
    p.sellingPrice && p.costPrice ? (((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100).toFixed(0) : '0'

  const handleDownloadTemplate = async () => {
    try {
      const writeExcelFile = (await import('write-excel-file/browser')).default
      const rows = productTemplateRowsToSheet()
      const sheetData = rows.map((row, rowIndex) => row.map(value => (
        rowIndex === 0
          ? { value, fontWeight: 'bold' as const, backgroundColor: '#FCE7F3', textColor: '#831843' }
          : { value }
      ))) as WritableSheetData

      await writeExcelFile(sheetData, {
        sheet: 'สินค้า',
        stickyRowsCount: 1,
        columns: [
          { width: 18 }, { width: 28 }, { width: 22 }, { width: 14 },
          { width: 14 }, { width: 16 }, { width: 18 }, { width: 18 },
          { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 },
          { width: 16 }, { width: 36 }, { width: 34 }, { width: 28 },
        ],
      }).toFile('product-import-template.xlsx')
    } catch (err) {
      console.error(err)
      alert('ไม่สามารถสร้างไฟล์ตัวอย่างได้ กรุณาลองใหม่')
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!companyId || !branchId || companyId === 'demo_company') {
      setImportSummary({
        fileName: file.name,
        imported: 0,
        skipped: 0,
        categoriesCreated: 0,
        errors: ['ระบบยังโหลดข้อมูลร้านไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่'],
        warnings: [],
      })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportSummary({
        fileName: file.name,
        imported: 0,
        skipped: 0,
        categoriesCreated: 0,
        errors: ['ไฟล์ใหญ่เกิน 5MB กรุณาแบ่งไฟล์เป็นชุดเล็กลง'],
        warnings: [],
      })
      return
    }

    setImporting(true)
    setImportSummary(null)
    try {
      let rows: SheetData
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = parseCsvRows(await file.text()) as SheetData
      } else {
        const { readSheet } = await import('read-excel-file/browser')
        rows = await readSheet(file)
      }

      const existingSkus = new Set(products.map(p => String(p.sku ?? '').trim().toLowerCase()).filter(Boolean))
      const parsed = parseProductImportRows(rows, existingSkus)
      if (parsed.errors.length > 0 || parsed.rows.length === 0) {
        setImportSummary({
          fileName: file.name,
          imported: 0,
          skipped: parsed.skipped,
          categoriesCreated: 0,
          errors: parsed.errors.map(i => `แถว ${i.row}: ${i.message}`).slice(0, 20),
          warnings: parsed.warnings.map(i => `แถว ${i.row}: ${i.message}`).slice(0, 20),
        })
        return
      }

      let batch = writeBatch(db)
      let ops = 0
      const commitIfNeeded = async (nextOps: number) => {
        if (ops > 0 && ops + nextOps > 450) {
          await batch.commit()
          batch = writeBatch(db)
          ops = 0
        }
      }

      const knownCategories = new Set(allCategories.map(c => c.trim().toLowerCase()).filter(Boolean))
      const categoriesToCreate = Array.from(new Set(parsed.rows.map(row => row.category.trim()).filter(Boolean)))
        .filter(name => !knownCategories.has(name.toLowerCase()))

      for (const categoryName of categoriesToCreate) {
        await commitIfNeeded(1)
        batch.set(doc(collection(db, 'product_categories')), {
          companyId,
          name: categoryName,
          icon: '📦',
          createdAt: serverTimestamp(),
        })
        ops += 1
      }

      for (const row of parsed.rows) {
        const productRef = doc(collection(db, COLLECTIONS.PRODUCTS))
        const targetBranchIds = isMainCatalogBranch ? catalogBranchIds : [branchId]
        const productData = compactObject({
          companyId,
          ...buildCatalogScopeFields(branchId, catalogBranchIds, isMainCatalogBranch),
          name: row.name,
          sku: row.sku,
          code: row.sku,
          barcode: row.barcode,
          category: row.category,
          description: row.description,
          images: row.imageUrl ? [row.imageUrl] : [],
          sellingPrice: row.sellingPrice,
          costPrice: row.costPrice,
          minStockAlert: row.minStockAlert,
          isWigProduct: row.isWigProduct,
          wigType: row.wigType,
          taxType: row.taxType,
          commissionRate: row.commissionRate,
          commissionAmount: row.commissionAmount,
          promotionPrice: row.promotionPrice,
          notes: row.notes,
          isActive: true,
          status: 'active',
          stockQty: row.initialStock,
          importedFrom: 'product_excel',
          importedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        const productOps = 1 + targetBranchIds.length + (row.initialStock > 0 ? 1 : 0)
        await commitIfNeeded(productOps)
        batch.set(productRef, productData)
        ops += 1

        for (const targetBranchId of targetBranchIds) {
          const quantity = targetBranchId === branchId ? row.initialStock : 0
          batch.set(doc(db, COLLECTIONS.INVENTORY, invId(productRef.id, targetBranchId)), {
            companyId,
            branchId: targetBranchId,
            productId: productRef.id,
            quantity,
            reservedQty: 0,
            availableQty: quantity,
            costPrice: row.costPrice,
            updatedAt: serverTimestamp(),
          }, { merge: true })
          ops += 1
        }

        if (row.initialStock > 0) {
          batch.set(doc(collection(db, COLLECTIONS.STOCK_MOVEMENTS)), {
            companyId,
            branchId,
            productId: productRef.id,
            productName: row.name,
            sku: row.sku,
            type: 'in',
            quantity: row.initialStock,
            previousQty: 0,
            newQty: row.initialStock,
            costPrice: row.costPrice,
            notes: `นำเข้าจากไฟล์ ${file.name}`,
            referenceType: 'product_import',
            performedBy: userId || 'system',
            createdAt: serverTimestamp(),
          })
          ops += 1
        }
      }

      if (ops > 0) await batch.commit()

      setImportSummary({
        fileName: file.name,
        imported: parsed.rows.length,
        skipped: parsed.skipped,
        categoriesCreated: categoriesToCreate.length,
        errors: [],
        warnings: parsed.warnings.map(i => `แถว ${i.row}: ${i.message}`).slice(0, 20),
      })
    } catch (err) {
      console.error(err)
      setImportSummary({
        fileName: file.name,
        imported: 0,
        skipped: 0,
        categoriesCreated: 0,
        errors: ['อ่านไฟล์ไม่สำเร็จ กรุณาใช้ไฟล์ .xlsx หรือ .csv จากไฟล์ตัวอย่างของระบบ'],
        warnings: [],
      })
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadServiceTemplate = async () => {
    try {
      const writeExcelFile = (await import('write-excel-file/browser')).default
      const rows = serviceTemplateRowsToSheet()
      const sheetData = rows.map((row, rowIndex) => row.map(value => (
        rowIndex === 0
          ? { value, fontWeight: 'bold' as const, backgroundColor: '#FCE7F3', textColor: '#831843' }
          : { value }
      ))) as WritableSheetData

      await writeExcelFile(sheetData, {
        sheet: 'บริการ',
        stickyRowsCount: 1,
        columns: [
          { width: 18 }, { width: 28 }, { width: 22 }, { width: 14 },
          { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 },
          { width: 36 },
        ],
      }).toFile('service-import-template.xlsx')
    } catch (err) {
      console.error(err)
      alert('ไม่สามารถสร้างไฟล์ตัวอย่างบริการได้ กรุณาลองใหม่')
    }
  }

  const handleImportServiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!companyId || !branchId || companyId === 'demo_company') {
      setServiceImportSummary({
        fileName: file.name,
        imported: 0,
        skipped: 0,
        categoriesCreated: 0,
        errors: ['ระบบยังโหลดข้อมูลร้านไม่เสร็จ กรุณารอสักครู่แล้วลองใหม่'],
        warnings: [],
      })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setServiceImportSummary({
        fileName: file.name,
        imported: 0,
        skipped: 0,
        categoriesCreated: 0,
        errors: ['ไฟล์ใหญ่เกิน 5MB กรุณาแบ่งไฟล์เป็นชุดเล็กลง'],
        warnings: [],
      })
      return
    }

    setServiceImporting(true)
    setServiceImportSummary(null)
    try {
      let rows: SheetData
      if (file.name.toLowerCase().endsWith('.csv')) {
        rows = parseCsvRows(await file.text()) as SheetData
      } else {
        const { readSheet } = await import('read-excel-file/browser')
        rows = await readSheet(file)
      }

      const existingCodes = new Set(services.map(s => String(s.code ?? '').trim().toLowerCase()).filter(Boolean))
      const parsed = parseServiceImportRows(rows, existingCodes)
      if (parsed.errors.length > 0 || parsed.rows.length === 0) {
        setServiceImportSummary({
          fileName: file.name,
          imported: 0,
          skipped: parsed.skipped,
          categoriesCreated: 0,
          errors: parsed.errors.map(i => `แถว ${i.row}: ${i.message}`).slice(0, 20),
          warnings: parsed.warnings.map(i => `แถว ${i.row}: ${i.message}`).slice(0, 20),
        })
        return
      }

      let batch = writeBatch(db)
      let ops = 0
      const commitIfNeeded = async (nextOps: number) => {
        if (ops > 0 && ops + nextOps > 450) {
          await batch.commit()
          batch = writeBatch(db)
          ops = 0
        }
      }

      const knownCategories = new Set(serviceCategories.map(c => c.trim().toLowerCase()).filter(Boolean))
      const categoriesToCreate = Array.from(new Set(parsed.rows.map(row => row.category.trim()).filter(Boolean)))
        .filter(name => !knownCategories.has(name.toLowerCase()))

      for (const categoryName of categoriesToCreate) {
        await commitIfNeeded(1)
        batch.set(doc(collection(db, 'service_categories')), {
          companyId,
          name: categoryName,
          icon: '✂️',
          createdAt: serverTimestamp(),
        })
        ops += 1
      }

      for (const row of parsed.rows) {
        const serviceRef = doc(collection(db, COLLECTIONS.SERVICES))
        const generatedCode = `SVC-${String(Date.now()).slice(-6)}-${String(row.sourceRow).padStart(3, '0')}`
        const serviceData = compactObject({
          companyId,
          ...buildCatalogScopeFields(branchId, catalogBranchIds, isMainCatalogBranch),
          code: row.code || generatedCode,
          name: row.name,
          category: row.category,
          price: row.price,
          duration: row.duration,
          commissionRate: row.commissionRate,
          commissionAmount: row.commissionAmount,
          taxType: row.taxType,
          isActive: true,
          notes: row.notes,
          status: 'active',
          importedFrom: 'service_excel',
          importedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        await commitIfNeeded(1)
        batch.set(serviceRef, serviceData)
        ops += 1
      }

      if (ops > 0) await batch.commit()

      setServiceImportSummary({
        fileName: file.name,
        imported: parsed.rows.length,
        skipped: parsed.skipped,
        categoriesCreated: categoriesToCreate.length,
        errors: [],
        warnings: parsed.warnings.map(i => `แถว ${i.row}: ${i.message}`).slice(0, 20),
      })
      setCatalogTab('services')
    } catch (err) {
      console.error(err)
      setServiceImportSummary({
        fileName: file.name,
        imported: 0,
        skipped: 0,
        categoriesCreated: 0,
        errors: ['อ่านไฟล์บริการไม่สำเร็จ กรุณาใช้ไฟล์ .xlsx หรือ .csv จากไฟล์ตัวอย่างของระบบ'],
        warnings: [],
      })
    } finally {
      setServiceImporting(false)
    }
  }

  /* Handle image selection */
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const validate = () => {
    const e: Partial<ProductForm> = {}
    if (!form.name.trim()) e.name = 'กรุณากรอกชื่อสินค้า'
    if (!form.sku.trim()) e.sku = 'กรุณากรอก SKU'
    if (!form.sellingPrice || isNaN(Number(form.sellingPrice))) e.sellingPrice = 'กรุณากรอกราคาขาย'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    if (!companyId || !branchId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่')
      return
    }
    setSubmitting(true)
    try {
      let imageUrl = ''
      // Upload image to Cloudinary
      if (imageFile) {
        setUploadProgress(true)
        imageUrl = await uploadToCloudinary(imageFile)
        setUploadProgress(false)
      }

      const productRef = doc(collection(db, COLLECTIONS.PRODUCTS))
      const targetBranchIds = isMainCatalogBranch ? catalogBranchIds : [branchId]
      const batch = writeBatch(db)

      batch.set(productRef, compactObject({
        companyId,
        ...buildCatalogScopeFields(branchId, catalogBranchIds, isMainCatalogBranch),
        name: form.name.trim(),
        sku: form.sku.trim(),
        code: form.sku.trim(),
        category: form.category || allCategories[0] || 'ทั่วไป',
        description: form.description.trim() || undefined,
        sellingPrice: Number(form.sellingPrice),
        costPrice: form.costPrice ? Number(form.costPrice) : 0,
        minStockAlert: form.minStockAlert ? Number(form.minStockAlert) : 0,
        isWigProduct: form.isWigProduct,
        images: imageUrl ? [imageUrl] : [],
        taxType: 'vat',
        isActive: true,
        status: 'active',
        stockQty: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }))

      for (const targetBranchId of targetBranchIds) {
        batch.set(doc(db, COLLECTIONS.INVENTORY, invId(productRef.id, targetBranchId)), {
          companyId,
          branchId: targetBranchId,
          productId: productRef.id,
          quantity: 0,
          reservedQty: 0,
          availableQty: 0,
          costPrice: form.costPrice ? Number(form.costPrice) : 0,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }

      await batch.commit()

      closeModal()
    } catch (err) {
      console.error(err)
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
      setUploadProgress(false)
    }
  }

  const validateService = () => {
    const e: Partial<ServiceForm> = {}
    if (!serviceForm.name.trim()) e.name = 'กรุณากรอกชื่อบริการ'
    if (!serviceForm.price || isNaN(Number(serviceForm.price))) e.price = 'กรุณากรอกราคา'
    if (serviceForm.duration && isNaN(Number(serviceForm.duration))) e.duration = 'กรุณากรอกระยะเวลาเป็นตัวเลข'
    setServiceErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateService()) return
    if (!companyId || !branchId || companyId === 'demo_company') {
      alert('ระบบกำลังโหลดข้อมูลผู้ใช้ กรุณารอสักครู่แล้วลองใหม่')
      return
    }
    setServiceSubmitting(true)
    try {
      const code = serviceForm.code.trim() || `SVC-${String(Date.now()).slice(-6)}`
      await addDocument<Service>(COLLECTIONS.SERVICES, {
        companyId,
        ...buildCatalogScopeFields(branchId, catalogBranchIds, isMainCatalogBranch),
        code,
        name: serviceForm.name.trim(),
        category: serviceForm.category.trim() || 'บริการทั่วไป',
        price: Number(serviceForm.price),
        duration: serviceForm.duration ? Number(serviceForm.duration) : 30,
        commissionRate: serviceForm.commissionRate ? Number(serviceForm.commissionRate) : undefined,
        commissionAmount: serviceForm.commissionAmount ? Number(serviceForm.commissionAmount) : undefined,
        taxType: 'vat',
        isActive: true,
        notes: serviceForm.notes.trim() || undefined,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Omit<Service, 'id'>)

      closeServiceModal()
      setCatalogTab('services')
    } catch (err) {
      console.error(err)
      alert('บันทึกบริการไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setServiceSubmitting(false)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(defaultForm)
    setErrors({})
    setImageFile(null)
    setImagePreview(null)
  }

  const closeServiceModal = () => {
    setShowServiceModal(false)
    setServiceForm(defaultServiceForm)
    setServiceErrors({})
  }

  const catIcon = (name: string) => categories.find(c => c.name === name)?.icon ?? '📦'
  const serviceCatIcon = (name: string) => serviceCategoriesData.find(c => c.name === name)?.icon ?? '✂️'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">สินค้าและบริการ</h1>
          <p className="text-sm text-[var(--text-muted)]">
            สินค้า {visibleProducts.length} รายการ · บริการ {visibleServices.length} รายการ
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {catalogTab === 'products' ? (
            <>
              <button onClick={handleDownloadTemplate} disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all disabled:opacity-50">
                <Download className="w-4 h-4" /> โหลดไฟล์ตัวอย่าง
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={handleImportFile}
              />
              <button onClick={() => importFileRef.current?.click()} disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all disabled:opacity-60">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'กำลังนำเข้า...' : 'นำเข้า Excel'}
              </button>
              <button onClick={() => setShowCatModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">
                <Tag className="w-4 h-4" /> จัดการหมวดหมู่สินค้า
              </button>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md">
                <Plus className="w-4 h-4" /> เพิ่มสินค้า
              </button>
            </>
          ) : (
            <>
              <button onClick={handleDownloadServiceTemplate} disabled={serviceImporting}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all disabled:opacity-50">
                <Download className="w-4 h-4" /> โหลดไฟล์ตัวอย่าง
              </button>
              <input
                ref={serviceImportFileRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={handleImportServiceFile}
              />
              <button onClick={() => serviceImportFileRef.current?.click()} disabled={serviceImporting}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all disabled:opacity-60">
                {serviceImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {serviceImporting ? 'กำลังนำเข้า...' : 'นำเข้า Excel'}
              </button>
              <button onClick={() => setShowServiceCatModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[var(--border-light)] rounded-xl text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-base)] transition-all">
                <Tag className="w-4 h-4" /> จัดการหมวดหมู่บริการ
              </button>
              <button onClick={() => setShowServiceModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md">
                <Plus className="w-4 h-4" /> เพิ่มบริการ
              </button>
            </>
          )}
        </div>
      </div>

      <div className="inline-flex rounded-2xl border border-[var(--border-light)] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setCatalogTab('products')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
            catalogTab === 'products'
              ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
          }`}
        >
          <Package className="h-4 w-4" /> รายการสินค้า ({visibleProducts.length})
        </button>
        <button
          type="button"
          onClick={() => setCatalogTab('services')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
            catalogTab === 'services'
              ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'
          }`}
        >
          <Scissors className="h-4 w-4" /> รายการบริการ ({visibleServices.length})
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-[var(--border-light)] p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={catalogTab === 'products' ? 'ค้นหา SKU ชื่อสินค้า...' : 'ค้นหาชื่อบริการ รหัสบริการ หรือหมวดหมู่...'}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]" />
        </div>
        {catalogTab === 'products' ? (
          <>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
              <option value="">ทุกหมวดหมู่</option>
              {allCategories.map(c => <option key={c} value={c}>{catIcon(c)} {c}</option>)}
            </select>
            <select value={filterWig} onChange={e => setFilterWig(e.target.value)}
              className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
              <option value="">ทุกประเภท</option>
              <option value="wig">สั่งผลิตวิก</option>
              <option value="regular">สินค้าทั่วไป</option>
            </select>
          </>
        ) : (
          <select value={serviceFilterCategory} onChange={e => setServiceFilterCategory(e.target.value)}
            className="px-3 py-2.5 bg-[var(--bg-base)] rounded-xl text-sm focus:outline-none border border-[var(--border-light)]">
            <option value="">ทุกหมวดบริการ</option>
            {serviceCategories.map(c => <option key={c} value={c}>{serviceCatIcon(c)} {c}</option>)}
          </select>
        )}
      </div>

      {catalogTab === 'products' && importSummary && (
        <div className={`rounded-2xl border p-4 ${
          importSummary.errors.length > 0
            ? 'bg-red-50 border-red-200'
            : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-start gap-3">
            {importSummary.errors.length > 0
              ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className={`text-sm font-bold ${importSummary.errors.length > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {importSummary.errors.length > 0 ? 'นำเข้าไม่สำเร็จ' : 'นำเข้าสินค้าสำเร็จ'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] break-all">
                    {importSummary.fileName} · เข้า {importSummary.imported} รายการ · ข้าม {importSummary.skipped} รายการ · สร้างหมวดใหม่ {importSummary.categoriesCreated} หมวด
                  </p>
                </div>
                <button onClick={() => setImportSummary(null)}
                  className="self-start sm:self-auto p-1.5 rounded-lg hover:bg-white/70 transition-all">
                  <X className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
              </div>

              {importSummary.errors.length > 0 && (
                <div className="mt-3 space-y-1">
                  {importSummary.errors.map((message, index) => (
                    <p key={`${message}-${index}`} className="text-xs text-red-700">{message}</p>
                  ))}
                </div>
              )}

              {importSummary.warnings.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs font-semibold text-amber-700 cursor-pointer">
                    ดูรายการแจ้งเตือน {importSummary.warnings.length} รายการ
                  </summary>
                  <div className="mt-2 space-y-1">
                    {importSummary.warnings.map((message, index) => (
                      <p key={`${message}-${index}`} className="text-xs text-amber-700">{message}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {catalogTab === 'services' && serviceImportSummary && (
        <div className={`rounded-2xl border p-4 ${
          serviceImportSummary.errors.length > 0
            ? 'bg-red-50 border-red-200'
            : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-start gap-3">
            {serviceImportSummary.errors.length > 0
              ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className={`text-sm font-bold ${serviceImportSummary.errors.length > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {serviceImportSummary.errors.length > 0 ? 'นำเข้าไม่สำเร็จ' : 'นำเข้าบริการสำเร็จ'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] break-all">
                    {serviceImportSummary.fileName} · เข้า {serviceImportSummary.imported} รายการ · ข้าม {serviceImportSummary.skipped} รายการ · สร้างหมวดใหม่ {serviceImportSummary.categoriesCreated} หมวด
                  </p>
                </div>
                <button onClick={() => setServiceImportSummary(null)}
                  className="self-start sm:self-auto p-1.5 rounded-lg hover:bg-white/70 transition-all">
                  <X className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
              </div>

              {serviceImportSummary.errors.length > 0 && (
                <div className="mt-3 space-y-1">
                  {serviceImportSummary.errors.map((message, index) => (
                    <p key={`${message}-${index}`} className="text-xs text-red-700">{message}</p>
                  ))}
                </div>
              )}

              {serviceImportSummary.warnings.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs font-semibold text-amber-700 cursor-pointer">
                    ดูรายการแจ้งเตือน {serviceImportSummary.warnings.length} รายการ
                  </summary>
                  <div className="mt-2 space-y-1">
                    {serviceImportSummary.warnings.map((message, index) => (
                      <p key={`${message}-${index}`} className="text-xs text-amber-700">{message}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {catalogTab === 'products' && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-light)] bg-white px-4 py-3 text-xs text-[var(--text-muted)]">
        <FileSpreadsheet className="w-4 h-4 text-[var(--pink-500)] shrink-0" />
        <span>นำเข้าได้สูงสุด {PRODUCT_IMPORT_MAX_ROWS.toLocaleString('th-TH')} รายการต่อไฟล์ รองรับ .xlsx และ .csv ถ้า SKU ซ้ำระบบจะข้ามให้</span>
        </div>
      )}

      {catalogTab === 'services' && (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-light)] bg-white px-4 py-3 text-xs text-[var(--text-muted)]">
        <FileSpreadsheet className="w-4 h-4 text-[var(--pink-500)] shrink-0" />
        <span>นำเข้าได้สูงสุด {SERVICE_IMPORT_MAX_ROWS.toLocaleString('th-TH')} รายการต่อไฟล์ รองรับ .xlsx และ .csv ถ้ารหัสบริการซ้ำระบบจะข้ามให้</span>
        </div>
      )}

      {/* Category chips */}
      {catalogTab === 'products' && categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterCategory('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!filterCategory ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
            ทั้งหมด ({visibleProducts.length})
          </button>
          {categories.map(cat => {
            const count = visibleProducts.filter(p => p.category === cat.name).length
            return (
              <button key={cat.id} onClick={() => setFilterCategory(cat.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filterCategory === cat.name ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {cat.icon} {cat.name} ({count})
              </button>
            )
          })}
        </div>
      )}

      {catalogTab === 'services' && serviceCategories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setServiceFilterCategory('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${!serviceFilterCategory ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
            ทั้งหมด ({visibleServices.length})
          </button>
          {serviceCategories.map(cat => {
            const count = visibleServices.filter(s => s.category === cat).length
            return (
              <button key={cat} onClick={() => setServiceFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${serviceFilterCategory === cat ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                {serviceCatIcon(cat)} {cat} ({count})
              </button>
            )
          })}
        </div>
      )}

      {catalogTab === 'products' ? (
        <>
          {/* Product grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Package className="w-16 h-16 text-[var(--text-muted)]" />
              <p className="text-[var(--text-muted)] text-sm">ยังไม่มีสินค้าในระบบ</p>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md">
                <Plus className="w-4 h-4" /> เพิ่มสินค้าแรก
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map(product => (
                <div key={product.id} className="bg-white rounded-2xl border border-[var(--border-light)] overflow-hidden hover:shadow-md hover:border-[var(--pink-200)] transition-all group">
                  {/* Image */}
                  <div className="aspect-square bg-[var(--bg-base)] flex items-center justify-center relative overflow-hidden">
                    {product.images?.[0] ? (
                      <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">{catIcon(product.category)}</span>
                    )}
                    {product.isWigProduct && (
                      <span className="absolute top-2 left-2 text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">สั่งผลิต</span>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                      <Link href={`/products/${product.id}`} className="p-1.5 bg-white rounded-lg shadow-sm text-[var(--text-muted)] hover:text-[var(--pink-600)] transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </Link>
                      <Link href={`/products/${product.id}/edit`} className="p-1.5 bg-white rounded-lg shadow-sm text-[var(--text-muted)] hover:text-blue-600 transition-colors">
                        <Edit className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-medium text-[var(--text-primary)] line-clamp-2 leading-tight">{product.name}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{product.sku} · {product.category}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-sm font-bold text-[var(--pink-600)]">{formatCurrency(product.sellingPrice)}</p>
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{margin(product)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {servicesLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#f472b6]" />
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Scissors className="w-16 h-16 text-[var(--text-muted)]" />
              <div className="text-center">
                <p className="text-[var(--text-muted)] text-sm">ยังไม่มีบริการในระบบ</p>
                <p className="text-xs text-[var(--text-light)] mt-1">บริการที่เพิ่มตรงนี้จะไปขึ้นใน POS แท็บ “บริการ”</p>
              </div>
              <button onClick={() => setShowServiceModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md">
                <Plus className="w-4 h-4" /> เพิ่มบริการแรก
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredServices.map(service => (
                <div key={service.id} className="bg-white rounded-2xl border border-[var(--border-light)] p-4 hover:shadow-md hover:border-[var(--pink-200)] transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--pink-50)] flex items-center justify-center shrink-0">
                      <Scissors className="w-5 h-5 text-[var(--pink-500)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-[var(--text-primary)] line-clamp-2 leading-snug">{service.name}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{service.code || '-'} · {service.category || 'บริการทั่วไป'}</p>
                        </div>
                        <p className="font-black text-[var(--pink-600)] whitespace-nowrap">{formatCurrency(service.price)}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-base)] px-2 py-1">
                          <Clock className="w-3 h-3" /> {service.duration || 30} นาที
                        </span>
                        {service.commissionRate ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-600">คอม {service.commissionRate}%</span>
                        ) : null}
                        {service.commissionAmount ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-600">คอม {formatCurrency(service.commissionAmount)}</span>
                        ) : null}
                      </div>
                      {service.notes && <p className="mt-3 text-xs text-[var(--text-muted)] line-clamp-2">{service.notes}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">เพิ่มสินค้าใหม่</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">

              {/* Image upload */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-2">รูปสินค้า</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`relative w-full h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 overflow-hidden
                    ${imagePreview ? 'border-[var(--pink-300)] bg-[var(--pink-50)]' : 'border-[var(--border-light)] bg-[var(--bg-base)] hover:border-[var(--pink-300)] hover:bg-[var(--pink-50)]'}`}>
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-all rounded-2xl">
                        <p className="text-white text-xs font-semibold">คลิกเพื่อเปลี่ยนรูป</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-8 h-8 text-[var(--text-muted)]" />
                      <p className="text-xs text-[var(--text-muted)]">คลิกเพื่ออัปโหลดรูปสินค้า</p>
                      <p className="text-[10px] text-[var(--text-light)]">JPG, PNG ขนาดไม่เกิน 5MB</p>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                {imagePreview && (
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null) }}
                    className="mt-1.5 text-xs text-red-500 hover:underline">ลบรูป</button>
                )}
              </div>

              {/* ชื่อสินค้า */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อสินค้า <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="กรอกชื่อสินค้า" className={inputCls} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">SKU <span className="text-red-500">*</span></label>
                <input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })}
                  placeholder="เช่น WIG-001" className={inputCls} />
                {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku}</p>}
              </div>

              {/* หมวดหมู่ */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[var(--text-muted)]">หมวดหมู่</label>
                  <button type="button" onClick={() => { closeModal(); setShowCatModal(true) }}
                    className="text-[10px] text-[var(--pink-500)] hover:underline">+ เพิ่มหมวดหมู่</button>
                </div>
                {allCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allCategories.map(c => (
                      <button key={c} type="button" onClick={() => setForm({ ...form, category: c })}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all
                          ${form.category === c ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white border-transparent' : 'bg-white border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-[var(--pink-50)]'}`}>
                        {catIcon(c)} {c}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)] py-2">
                    ยังไม่มีหมวดหมู่ —{' '}
                    <button type="button" onClick={() => { closeModal(); setShowCatModal(true) }} className="text-[var(--pink-500)] hover:underline">สร้างหมวดหมู่ก่อน</button>
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">คำอธิบาย</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="รายละเอียดสินค้า..." className={inputCls + ' resize-none'} />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคาขาย (บาท) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })}
                    placeholder="0" className={inputCls} />
                  {errors.sellingPrice && <p className="text-red-500 text-xs mt-1">{errors.sellingPrice}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคาทุน (บาท)</label>
                  <input type="number" min="0" value={form.costPrice} onChange={e => setForm({ ...form, costPrice: e.target.value })}
                    placeholder="0" className={inputCls} />
                </div>
              </div>

              {/* Min stock */}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">สต๊อกขั้นต่ำ (แจ้งเตือนเมื่อต่ำกว่า)</label>
                <input type="number" min="0" value={form.minStockAlert} onChange={e => setForm({ ...form, minStockAlert: e.target.value })}
                  placeholder="0" className={inputCls} />
              </div>

              {/* Is wig toggle */}
              <div className="flex items-center gap-3 p-3 bg-[var(--bg-base)] rounded-xl">
                <button type="button" onClick={() => setForm({ ...form, isWigProduct: !form.isWigProduct })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isWigProduct ? 'bg-gradient-to-r from-[#f472b6] to-[#e879a0]' : 'bg-[#e8e0d5]'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isWigProduct ? 'translate-x-5' : ''}`} />
                </button>
                <div>
                  <p className="text-sm text-[var(--text-secondary)] font-medium">เป็นวิก (สินค้าสั่งผลิต)</p>
                  <p className="text-xs text-[var(--text-muted)]">จะเชื่อมกับระบบงานผลิต</p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-base)] text-[var(--text-muted)] rounded-xl text-sm font-semibold hover:bg-[#ede8e0] transition-all">
                  ยกเลิก
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-60">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{uploadProgress ? 'กำลังอัปโหลดรูป...' : 'กำลังบันทึก...'}</>
                  ) : (
                    <><Plus className="w-4 h-4" />บันทึก</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Service Modal */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[var(--border-light)]">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)]">เพิ่มบริการใหม่</h2>
                <p className="text-xs text-[var(--text-muted)]">บริการที่เพิ่มตรงนี้จะไปขึ้นหน้า POS แท็บ “บริการ”</p>
              </div>
              <button onClick={closeServiceModal} className="p-1.5 rounded-lg hover:bg-[var(--bg-base)] text-[var(--text-muted)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmitService} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ชื่อบริการ <span className="text-red-500">*</span></label>
                <input value={serviceForm.name} onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })}
                  placeholder="เช่น ตัดผม, ปรับแต่งวิก, วัดหัว" className={inputCls} />
                {serviceErrors.name && <p className="text-red-500 text-xs mt-1">{serviceErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">รหัสบริการ</label>
                  <input value={serviceForm.code} onChange={e => setServiceForm({ ...serviceForm, code: e.target.value })}
                    placeholder="เว้นว่างให้ระบบสร้าง" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">หมวดบริการ</label>
                  <input value={serviceForm.category} onChange={e => setServiceForm({ ...serviceForm, category: e.target.value })}
                    list="service-category-options" placeholder="เช่น บริการวิก" className={inputCls} />
                  <datalist id="service-category-options">
                    {serviceCategories.map(c => <option key={c} value={c} />)}
                    <option value="บริการวิก" />
                    <option value="งานซ่อมวิก" />
                    <option value="งานตัดแต่ง" />
                    <option value="ให้คำปรึกษา" />
                    <option value="ค่าบริการอื่นๆ" />
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ราคา (บาท) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" value={serviceForm.price} onChange={e => setServiceForm({ ...serviceForm, price: e.target.value })}
                    placeholder="0" className={inputCls} />
                  {serviceErrors.price && <p className="text-red-500 text-xs mt-1">{serviceErrors.price}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ระยะเวลา (นาที)</label>
                  <input type="number" min="0" value={serviceForm.duration} onChange={e => setServiceForm({ ...serviceForm, duration: e.target.value })}
                    placeholder="30" className={inputCls} />
                  {serviceErrors.duration && <p className="text-red-500 text-xs mt-1">{serviceErrors.duration}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ค่าคอม (%)</label>
                  <input type="number" min="0" value={serviceForm.commissionRate} onChange={e => setServiceForm({ ...serviceForm, commissionRate: e.target.value })}
                    placeholder="เช่น 10" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">ค่าคอมแบบจำนวนเงิน</label>
                  <input type="number" min="0" value={serviceForm.commissionAmount} onChange={e => setServiceForm({ ...serviceForm, commissionAmount: e.target.value })}
                    placeholder="เช่น 100" className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1">หมายเหตุ</label>
                <textarea value={serviceForm.notes} onChange={e => setServiceForm({ ...serviceForm, notes: e.target.value })}
                  rows={2} placeholder="รายละเอียดบริการเพิ่มเติม..." className={inputCls + ' resize-none'} />
              </div>

              <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-muted)]">
                ถ้าเป็นของที่ต้องตัดสต๊อก เช่น วิกหรืออุปกรณ์ ให้เพิ่มเป็น “สินค้า” เหมือนเดิม แต่ถ้าเป็นค่าแรง/ค่าบริการ ให้เพิ่มตรงนี้
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeServiceModal}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-base)] text-[var(--text-muted)] rounded-xl text-sm font-semibold hover:bg-[#ede8e0] transition-all">
                  ยกเลิก
                </button>
                <button type="submit" disabled={serviceSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#f472b6] to-[#e879a0] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-60">
                  {serviceSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</>
                  ) : (
                    <><Plus className="w-4 h-4" />บันทึกบริการ</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <CategoryModal categories={categories} companyId={companyId} onClose={() => setShowCatModal(false)} />
      )}

      {showServiceCatModal && (
        <CategoryModal
          categories={serviceCategoriesData}
          companyId={companyId}
          collectionName="service_categories"
          title="จัดการหมวดหมู่บริการ"
          addLabel="เพิ่มหมวดหมู่บริการใหม่"
          placeholder="ชื่อหมวดบริการ เช่น งานตัดแต่ง, งานซ่อมวิก..."
          emptyText="ยังไม่มีหมวดหมู่บริการ — เพิ่มด้านบนได้เลย"
          defaultIcon="✂️"
          onClose={() => setShowServiceCatModal(false)}
        />
      )}
    </div>
  )
}
