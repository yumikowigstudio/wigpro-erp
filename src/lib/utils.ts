import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('th-TH').format(num)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatShortDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
  }).format(d)
}

export function generateCustomerId(seq: number): string {
  return `CUS-${String(seq).padStart(6, '0')}`
}

export function generateWorkOrderNo(branchCode: string, seq: number): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const year = String(today.getFullYear()).slice(-2)
  return `${branchCode}${month}${year}${String(seq).padStart(4, '0')}`
}

export function generateReceiptNo(branchCode: string, seq: number): string {
  const today = new Date()
  const year = String(today.getFullYear()).slice(-2)
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `RCP-${branchCode}${year}${month}${day}-${String(seq).padStart(4, '0')}`
}

export function getThaiMonth(month: number): string {
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ]
  return months[month]
}

export function getThaiYear(year: number): number {
  return year + 543
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function calculateVat(amount: number, taxRate = 0.07): { beforeVat: number; vat: number; total: number } {
  const beforeVat = amount / (1 + taxRate)
  const vat = amount - beforeVat
  return { beforeVat, vat, total: amount }
}

export function addVat(amount: number, taxRate = 0.07): { beforeVat: number; vat: number; total: number } {
  const vat = amount * taxRate
  return { beforeVat: amount, vat, total: amount + vat }
}
