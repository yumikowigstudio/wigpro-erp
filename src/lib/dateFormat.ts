const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/

function isValidDateParts(year: number, month: number, day: number) {
  const value = new Date(year, month - 1, day)
  return value.getFullYear() === year
    && value.getMonth() === month - 1
    && value.getDate() === day
}

export function isoDateToDisplay(value?: string | null) {
  const match = value?.match(ISO_DATE_PATTERN)
  if (!match) return ''
  const [, year, month, day] = match
  if (!isValidDateParts(Number(year), Number(month), Number(day))) return ''
  return `${day}/${month}/${year}`
}

export function displayDateToIso(value: string) {
  const match = value.match(DISPLAY_DATE_PATTERN)
  if (!match) return null
  const [, day, month, year] = match
  if (!isValidDateParts(Number(year), Number(month), Number(day))) return null
  return `${year}-${month}-${day}`
}

export function maskDisplayDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function formatThaiReceiptDate(value?: Date | string | null) {
  if (!value) return '-'

  if (typeof value === 'string') {
    const match = value.slice(0, 10).match(ISO_DATE_PATTERN)
    if (match) {
      const [, year, month, day] = match
      if (!isValidDateParts(Number(year), Number(month), Number(day))) return '-'
      return `${day}/${month}/${Number(year) + 543}`
    }
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear() + 543}`
}
