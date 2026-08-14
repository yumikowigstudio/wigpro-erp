export const SERVICE_IMPORT_MAX_ROWS = 1000

export const SERVICE_IMPORT_HEADERS = [
  'รหัสบริการ',
  'ชื่อบริการ *',
  'หมวดบริการ',
  'ราคา *',
  'ระยะเวลา (นาที)',
  'ประเภทภาษี',
  'ค่าคอม %',
  'ค่าคอมต่อบริการ',
  'หมายเหตุ',
] as const

export const SERVICE_IMPORT_SAMPLE_ROWS: ServiceImportTemplateRow[] = [
  {
    code: 'SVC-001',
    name: 'ตัดแต่งวิก',
    category: 'งานตัดแต่ง',
    price: 500,
    duration: 30,
    taxType: 'vat',
    commissionRate: 10,
    commissionAmount: '',
    notes: 'ตัวอย่างบริการ สามารถลบแถวนี้ก่อนนำเข้า',
  },
  {
    code: 'SVC-002',
    name: 'ให้คำปรึกษาและวัดหัว',
    category: 'ให้คำปรึกษา',
    price: 0,
    duration: 30,
    taxType: 'vat',
    commissionRate: '',
    commissionAmount: '',
    notes: 'ตัวอย่างบริการ สามารถลบแถวนี้ก่อนนำเข้า',
  },
]

export type ServiceImportTemplateRow = {
  code: string
  name: string
  category: string
  price: number
  duration: number
  taxType: string
  commissionRate: number | ''
  commissionAmount: number | ''
  notes: string
}

export type ServiceImportDraft = {
  sourceRow: number
  code: string
  name: string
  category: string
  price: number
  duration: number
  taxType: 'vat' | 'non_vat'
  commissionRate?: number
  commissionAmount?: number
  notes?: string
}

export type ServiceImportIssue = {
  row: number
  message: string
}

export type ServiceImportParseResult = {
  rows: ServiceImportDraft[]
  errors: ServiceImportIssue[]
  warnings: ServiceImportIssue[]
  skipped: number
}

type ServiceImportField = keyof Omit<ServiceImportDraft, 'sourceRow'>
type ImportCell = unknown
type ImportRecord = Partial<Record<ServiceImportField, ImportCell>>

const HEADER_ALIASES: Record<ServiceImportField, string[]> = {
  code: ['code', 'service code', 'รหัสบริการ', 'รหัสบริการ *'],
  name: ['name', 'service name', 'ชื่อบริการ', 'ชื่อบริการ *'],
  category: ['category', 'service category', 'หมวดบริการ', 'หมวดหมู่บริการ'],
  price: ['price', 'service price', 'ราคา', 'ราคา *', 'ราคาบริการ'],
  duration: ['duration', 'minutes', 'ระยะเวลา', 'ระยะเวลา (นาที)', 'นาที'],
  taxType: ['tax type', 'vat', 'ประเภทภาษี', 'ภาษี'],
  commissionRate: ['commission rate', 'commission %', 'ค่าคอม %', 'ค่าคอมเปอร์เซ็นต์'],
  commissionAmount: ['commission amount', 'ค่าคอมต่อบริการ', 'ค่าคอมบาท', 'คอมต่อบริการ'],
  notes: ['notes', 'note', 'หมายเหตุ'],
}

const NORMALIZED_HEADER_MAP = Object.entries(HEADER_ALIASES).reduce<Record<string, ServiceImportField>>((map, [field, aliases]) => {
  for (const alias of aliases) {
    map[normalizeHeader(alias)] = field as ServiceImportField
  }
  return map
}, {})

export function serviceTemplateRowsToSheet(): (string | number)[][] {
  return [
    [...SERVICE_IMPORT_HEADERS],
    ...SERVICE_IMPORT_SAMPLE_ROWS.map(row => [
      row.code,
      row.name,
      row.category,
      row.price,
      row.duration,
      row.taxType,
      row.commissionRate,
      row.commissionAmount,
      row.notes,
    ]),
  ]
}

export function parseServiceImportRows(
  rows: ImportCell[][],
  existingCodes: Set<string>,
): ServiceImportParseResult {
  const errors: ServiceImportIssue[] = []
  const warnings: ServiceImportIssue[] = []
  const drafts: ServiceImportDraft[] = []
  const [headerRow, ...dataRows] = rows

  if (!headerRow?.length) {
    return { rows: [], errors: [{ row: 1, message: 'ไม่พบหัวตารางในไฟล์' }], warnings, skipped: 0 }
  }

  const fields = headerRow.map(cell => NORMALIZED_HEADER_MAP[normalizeHeader(toText(cell))] ?? null)
  if (!fields.includes('name') || !fields.includes('price')) {
    errors.push({ row: 1, message: 'ไฟล์ต้องมีคอลัมน์ ชื่อบริการ * และ ราคา *' })
    return { rows: [], errors, warnings, skipped: 0 }
  }

  if (dataRows.length > SERVICE_IMPORT_MAX_ROWS) {
    errors.push({ row: SERVICE_IMPORT_MAX_ROWS + 2, message: `นำเข้าได้สูงสุด ${SERVICE_IMPORT_MAX_ROWS.toLocaleString('th-TH')} รายการต่อไฟล์` })
    return { rows: [], errors, warnings, skipped: dataRows.length }
  }

  let skipped = 0
  const seenCodes = new Set<string>()

  dataRows.forEach((row, index) => {
    const sourceRow = index + 2
    if (row.every(cell => !toText(cell))) return

    const record: ImportRecord = {}
    row.forEach((cell, cellIndex) => {
      const field = fields[cellIndex]
      if (field) record[field] = cell
    })

    const rowErrors: string[] = []
    const code = toText(record.code)
    const normalizedCode = code.toLowerCase()
    const name = toText(record.name)
    const category = toText(record.category) || 'บริการทั่วไป'
    const price = parseNumber(record.price)
    const duration = parseWholeNumber(record.duration) ?? 30
    const commissionRate = parseOptionalPercent(record.commissionRate)
    const commissionAmount = parseNumber(record.commissionAmount)
    const taxType = parseTaxType(record.taxType)

    if (!name) rowErrors.push('ยังไม่ได้กรอกชื่อบริการ')
    if (price == null) rowErrors.push('ราคาต้องเป็นตัวเลข')
    if (price != null && price < 0) rowErrors.push('ราคาต้องไม่ติดลบ')
    if (duration < 0) rowErrors.push('ระยะเวลาต้องไม่ติดลบ')
    if (commissionRate != null && (commissionRate < 0 || commissionRate > 100)) rowErrors.push('ค่าคอม % ต้องอยู่ระหว่าง 0-100')
    if (commissionAmount != null && commissionAmount < 0) rowErrors.push('ค่าคอมต่อบริการต้องไม่ติดลบ')

    if (normalizedCode && existingCodes.has(normalizedCode)) {
      skipped += 1
      warnings.push({ row: sourceRow, message: `ข้ามรหัสบริการ ${code} เพราะมีอยู่ในระบบแล้ว` })
      return
    }

    if (normalizedCode && seenCodes.has(normalizedCode)) {
      skipped += 1
      warnings.push({ row: sourceRow, message: `ข้ามรหัสบริการ ${code} เพราะซ้ำกับแถวก่อนหน้าในไฟล์` })
      return
    }

    if (taxType.warning) {
      warnings.push({ row: sourceRow, message: taxType.warning })
    }

    if (commissionRate != null && commissionAmount != null) {
      warnings.push({ row: sourceRow, message: 'มีทั้งค่าคอม % และค่าคอมต่อบริการ ตอนขายระบบจะใช้ค่าคอมต่อบริการก่อน' })
    }

    if (rowErrors.length) {
      errors.push({ row: sourceRow, message: rowErrors.join(', ') })
      return
    }

    if (normalizedCode) seenCodes.add(normalizedCode)
    drafts.push({
      sourceRow,
      code,
      name,
      category,
      price: price ?? 0,
      duration,
      taxType: taxType.value,
      commissionRate: commissionRate ?? undefined,
      commissionAmount: commissionAmount ?? undefined,
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

function parseTaxType(value: ImportCell): { value: 'vat' | 'non_vat'; warning?: string } {
  const text = toText(value).toLowerCase().replace(/\s/g, '')
  if (!text || ['vat', 'มีvat', 'vat7', 'vat7%', 'ภาษี', 'ภาษีมูลค่าเพิ่ม'].includes(text)) return { value: 'vat' }
  if (['nonvat', 'non_vat', 'novat', 'ไม่มีvat', 'ไม่มีภาษี', 'ยกเว้นภาษี'].includes(text)) return { value: 'non_vat' }
  return { value: 'vat', warning: `ประเภทภาษี "${toText(value)}" ไม่รู้จัก ระบบตั้งเป็น vat ให้อัตโนมัติ` }
}
