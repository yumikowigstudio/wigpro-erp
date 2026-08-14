export const PRODUCT_IMPORT_MAX_ROWS = 1000

export const PRODUCT_IMPORT_HEADERS = [
  'SKU *',
  'ชื่อสินค้า *',
  'หมวดหมู่',
  'ราคาขาย *',
  'ต้นทุน',
  'สต็อกเริ่มต้น',
  'แจ้งเตือนขั้นต่ำ',
  'เป็นวิกสั่งผลิต',
  'ประเภทวิก',
  'ประเภทภาษี',
  'ค่าคอม %',
  'ค่าคอมต่อชิ้น',
  'ราคาโปรโมชั่น',
  'รายละเอียด',
  'URL รูปสินค้า',
  'หมายเหตุ',
] as const

export const PRODUCT_IMPORT_SAMPLE_ROWS: ProductImportTemplateRow[] = [
  {
    sku: 'WIG-001',
    name: 'วิกผมยาวธรรมชาติ',
    category: 'วิกผม',
    sellingPrice: 8900,
    costPrice: 4500,
    initialStock: 0,
    minStockAlert: 2,
    isWigProduct: 'ใช่',
    wigType: 'สั่งผลิต',
    taxType: 'vat',
    commissionRate: 5,
    commissionAmount: '',
    promotionPrice: '',
    description: 'ตัวอย่างสินค้า สามารถลบแถวนี้ก่อนนำเข้า',
    imageUrl: '',
    notes: '',
  },
  {
    sku: 'ACC-001',
    name: 'แชมพูดูแลวิก',
    category: 'อุปกรณ์ดูแลวิก',
    sellingPrice: 590,
    costPrice: 220,
    initialStock: 10,
    minStockAlert: 3,
    isWigProduct: 'ไม่ใช่',
    wigType: '',
    taxType: 'vat',
    commissionRate: '',
    commissionAmount: 20,
    promotionPrice: '',
    description: 'ตัวอย่างสินค้า สามารถลบแถวนี้ก่อนนำเข้า',
    imageUrl: '',
    notes: '',
  },
]

export type ProductImportTemplateRow = {
  sku: string
  name: string
  category: string
  sellingPrice: number
  costPrice: number
  initialStock: number
  minStockAlert: number
  isWigProduct: string
  wigType: string
  taxType: string
  commissionRate: number | ''
  commissionAmount: number | ''
  promotionPrice: number | ''
  description: string
  imageUrl: string
  notes: string
}

export type ProductImportDraft = {
  sourceRow: number
  sku: string
  barcode?: string
  name: string
  category: string
  sellingPrice: number
  costPrice: number
  initialStock: number
  minStockAlert: number
  isWigProduct: boolean
  wigType?: string
  taxType: 'vat' | 'non_vat'
  commissionRate?: number
  commissionAmount?: number
  promotionPrice?: number
  description?: string
  imageUrl?: string
  notes?: string
}

export type ProductImportIssue = {
  row: number
  message: string
}

export type ProductImportParseResult = {
  rows: ProductImportDraft[]
  errors: ProductImportIssue[]
  warnings: ProductImportIssue[]
  skipped: number
}

type ProductImportField = keyof Omit<ProductImportDraft, 'sourceRow'>
type ImportCell = unknown
type ImportRecord = Partial<Record<ProductImportField, ImportCell>>

const HEADER_ALIASES: Record<ProductImportField, string[]> = {
  sku: ['sku', 'รหัสสินค้า', 'รหัสสินค้า sku', 'รหัสสินค้า/SKU', 'รหัสสินค้า *', 'SKU *'],
  barcode: ['barcode', 'บาร์โค้ด', 'บาร์โค๊ด'],
  name: ['name', 'ชื่อสินค้า', 'ชื่อสินค้า *', 'product name'],
  category: ['category', 'หมวดหมู่', 'หมวดสินค้า'],
  sellingPrice: ['selling price', 'price', 'ราคาขาย', 'ราคาขาย *'],
  costPrice: ['cost price', 'cost', 'ต้นทุน', 'ราคาทุน'],
  initialStock: ['initial stock', 'stock', 'stock qty', 'สต็อกเริ่มต้น', 'จำนวนเริ่มต้น', 'จำนวน'],
  minStockAlert: ['min stock', 'minimum stock', 'แจ้งเตือนขั้นต่ำ', 'สต็อกขั้นต่ำ'],
  isWigProduct: ['is wig product', 'wig', 'เป็นวิก', 'เป็นวิกสั่งผลิต', 'วิกสั่งผลิต'],
  wigType: ['wig type', 'ประเภทวิก', 'ชนิดวิก'],
  taxType: ['tax type', 'vat', 'ประเภทภาษี', 'ภาษี'],
  commissionRate: ['commission rate', 'commission %', 'ค่าคอม %', 'ค่าคอมเปอร์เซ็นต์'],
  commissionAmount: ['commission amount', 'ค่าคอมต่อชิ้น', 'ค่าคอมบาท', 'คอมต่อชิ้น'],
  promotionPrice: ['promotion price', 'promo price', 'ราคาโปรโมชั่น', 'โปรโมชัน'],
  description: ['description', 'รายละเอียด', 'คำอธิบาย'],
  imageUrl: ['image url', 'image', 'url รูปสินค้า', 'รูปสินค้า', 'ลิงก์รูป'],
  notes: ['notes', 'note', 'หมายเหตุ'],
}

const NORMALIZED_HEADER_MAP = Object.entries(HEADER_ALIASES).reduce<Record<string, ProductImportField>>((map, [field, aliases]) => {
  for (const alias of aliases) {
    map[normalizeHeader(alias)] = field as ProductImportField
  }
  return map
}, {})

export function productTemplateRowsToSheet(): (string | number)[][] {
  return [
    [...PRODUCT_IMPORT_HEADERS],
    ...PRODUCT_IMPORT_SAMPLE_ROWS.map(row => [
      row.sku,
      row.name,
      row.category,
      row.sellingPrice,
      row.costPrice,
      row.initialStock,
      row.minStockAlert,
      row.isWigProduct,
      row.wigType,
      row.taxType,
      row.commissionRate,
      row.commissionAmount,
      row.promotionPrice,
      row.description,
      row.imageUrl,
      row.notes,
    ]),
  ]
}

export function parseCsvRows(text: string): ImportCell[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows.filter(r => r.some(value => String(value ?? '').trim()))
}

export function parseProductImportRows(
  rows: ImportCell[][],
  existingSkus: Set<string>,
): ProductImportParseResult {
  const errors: ProductImportIssue[] = []
  const warnings: ProductImportIssue[] = []
  const drafts: ProductImportDraft[] = []
  const [headerRow, ...dataRows] = rows

  if (!headerRow?.length) {
    return { rows: [], errors: [{ row: 1, message: 'ไม่พบหัวตารางในไฟล์' }], warnings, skipped: 0 }
  }

  const fields = headerRow.map(cell => NORMALIZED_HEADER_MAP[normalizeHeader(toText(cell))] ?? null)
  if (!fields.includes('sku') || !fields.includes('name') || !fields.includes('sellingPrice')) {
    errors.push({ row: 1, message: 'ไฟล์ต้องมีคอลัมน์ SKU *, ชื่อสินค้า * และ ราคาขาย *' })
    return { rows: [], errors, warnings, skipped: 0 }
  }

  if (dataRows.length > PRODUCT_IMPORT_MAX_ROWS) {
    errors.push({ row: PRODUCT_IMPORT_MAX_ROWS + 2, message: `นำเข้าได้สูงสุด ${PRODUCT_IMPORT_MAX_ROWS.toLocaleString('th-TH')} รายการต่อไฟล์` })
    return { rows: [], errors, warnings, skipped: dataRows.length }
  }

  let skipped = 0
  const seenSkus = new Set<string>()

  dataRows.forEach((row, index) => {
    const sourceRow = index + 2
    if (row.every(cell => !toText(cell))) return

    const record: ImportRecord = {}
    row.forEach((cell, cellIndex) => {
      const field = fields[cellIndex]
      if (field) record[field] = cell
    })

    const rowErrors: string[] = []
    const sku = toText(record.sku)
    const normalizedSku = sku.toLowerCase()
    const name = toText(record.name)
    const category = toText(record.category) || 'ทั่วไป'
    const sellingPrice = parseNumber(record.sellingPrice)
    const costPrice = parseNumber(record.costPrice) ?? 0
    const initialStock = parseWholeNumber(record.initialStock) ?? 0
    const minStockAlert = parseWholeNumber(record.minStockAlert) ?? 0
    const commissionRate = parseOptionalPercent(record.commissionRate)
    const commissionAmount = parseNumber(record.commissionAmount)
    const promotionPrice = parseNumber(record.promotionPrice)
    const taxType = parseTaxType(record.taxType)

    if (!sku) rowErrors.push('ยังไม่ได้กรอก SKU')
    if (!name) rowErrors.push('ยังไม่ได้กรอกชื่อสินค้า')
    if (sellingPrice == null) rowErrors.push('ราคาขายต้องเป็นตัวเลข')
    if (sellingPrice != null && sellingPrice < 0) rowErrors.push('ราคาขายต้องไม่ติดลบ')
    if (costPrice < 0) rowErrors.push('ต้นทุนต้องไม่ติดลบ')
    if (initialStock < 0) rowErrors.push('สต็อกเริ่มต้นต้องไม่ติดลบ')
    if (minStockAlert < 0) rowErrors.push('แจ้งเตือนขั้นต่ำต้องไม่ติดลบ')
    if (commissionRate != null && (commissionRate < 0 || commissionRate > 100)) rowErrors.push('ค่าคอม % ต้องอยู่ระหว่าง 0-100')
    if (commissionAmount != null && commissionAmount < 0) rowErrors.push('ค่าคอมต่อชิ้นต้องไม่ติดลบ')
    if (promotionPrice != null && promotionPrice < 0) rowErrors.push('ราคาโปรโมชั่นต้องไม่ติดลบ')

    if (normalizedSku && existingSkus.has(normalizedSku)) {
      skipped += 1
      warnings.push({ row: sourceRow, message: `ข้าม SKU ${sku} เพราะมีอยู่ในระบบแล้ว` })
      return
    }

    if (normalizedSku && seenSkus.has(normalizedSku)) {
      skipped += 1
      warnings.push({ row: sourceRow, message: `ข้าม SKU ${sku} เพราะซ้ำกับแถวก่อนหน้าในไฟล์` })
      return
    }

    if (taxType.warning) {
      warnings.push({ row: sourceRow, message: taxType.warning })
    }

    if (commissionRate != null && commissionAmount != null) {
      warnings.push({ row: sourceRow, message: 'มีทั้งค่าคอม % และค่าคอมต่อชิ้น ตอนขายระบบจะใช้ค่าคอมต่อชิ้นก่อน' })
    }

    if (rowErrors.length) {
      errors.push({ row: sourceRow, message: rowErrors.join(', ') })
      return
    }

    seenSkus.add(normalizedSku)
    drafts.push({
      sourceRow,
      sku,
      barcode: toText(record.barcode) || undefined,
      name,
      category,
      sellingPrice: sellingPrice ?? 0,
      costPrice,
      initialStock,
      minStockAlert,
      isWigProduct: parseBoolean(record.isWigProduct),
      wigType: toText(record.wigType) || undefined,
      taxType: taxType.value,
      commissionRate: commissionRate ?? undefined,
      commissionAmount: commissionAmount ?? undefined,
      promotionPrice: promotionPrice ?? undefined,
      description: toText(record.description) || undefined,
      imageUrl: sanitizeImageUrl(record.imageUrl),
      notes: toText(record.notes) || undefined,
    })
  })

  return { rows: drafts, errors, warnings, skipped }
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/\ufeff/g, '')
    .replace(/\*/g, '')
    .replace(/[()[\]{}:：/\\._\-\s]/g, '')
}

function toText(value: ImportCell): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

function parseNumber(value: ImportCell): number | null {
  const text = toText(value)
    .replace(/บาท/g, '')
    .replace(/฿/g, '')
    .replace(/,/g, '')
    .trim()
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function parseWholeNumber(value: ImportCell): number | null {
  const parsed = parseNumber(value)
  if (parsed == null) return null
  return Math.floor(parsed)
}

function parseOptionalPercent(value: ImportCell): number | null {
  const text = toText(value).replace('%', '').trim()
  if (!text) return null
  return parseNumber(text)
}

function parseBoolean(value: ImportCell): boolean {
  const text = toText(value).toLowerCase()
  return ['1', 'true', 'yes', 'y', 'ใช่', 'วิก', 'สั่งผลิต'].includes(text)
}

function parseTaxType(value: ImportCell): { value: 'vat' | 'non_vat'; warning?: string } {
  const text = toText(value).toLowerCase().replace(/\s/g, '')
  if (!text || ['vat', 'มีvat', 'vat7', 'vat7%', 'ภาษี', 'ภาษีมูลค่าเพิ่ม'].includes(text)) return { value: 'vat' }
  if (['nonvat', 'non_vat', 'novat', 'ไม่มีvat', 'ไม่มีภาษี', 'ยกเว้นภาษี'].includes(text)) return { value: 'non_vat' }
  return { value: 'vat', warning: `ประเภทภาษี "${toText(value)}" ไม่รู้จัก ระบบตั้งเป็น vat ให้อัตโนมัติ` }
}

function sanitizeImageUrl(value: ImportCell): string | undefined {
  const text = toText(value)
  if (!text) return undefined
  return /^https?:\/\//i.test(text) ? text : undefined
}
