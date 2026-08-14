// Export ข้อมูลเป็นไฟล์ CSV ที่เปิดใน Excel ได้ (ใส่ UTF-8 BOM เพื่อให้ภาษาไทยไม่เพี้ยน)
// ไม่ต้องพึ่ง library ภายนอก
function escapeCell(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const lines = [headers, ...rows].map(r => r.map(escapeCell).join(','))
  const csv = '\ufeff' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`)
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
  downloadBlob(blob, filename.endsWith('.json') ? filename : `${filename}.json`)
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
