import crypto from 'node:crypto'

// ตั้งค่าใน Environment Variables (Vercel):
//   LINE_CHANNEL_ACCESS_TOKEN = <Channel access token จาก LINE Developers>
//   LINE_CHANNEL_SECRET       = <Channel secret>
const TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN
const SECRET = process.env.LINE_CHANNEL_SECRET

export const lineConfigured = () => !!(TOKEN && SECRET)

// ตรวจลายเซ็นของ webhook (กันคนอื่นยิงปลอม) — HMAC-SHA256 ด้วย channel secret
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  if (!SECRET || !signature) return false
  const hash = crypto.createHmac('sha256', SECRET).update(rawBody).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

export const textMessage = (text: string) => ({ type: 'text' as const, text })

// ตอบกลับข้อความ (ใช้ replyToken จาก event — มีอายุสั้น ใช้ได้ครั้งเดียว)
export async function replyMessage(replyToken: string, messages: unknown[]): Promise<void> {
  if (!TOKEN) throw new Error('LINE not configured')
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  })
}

// ส่งข้อความหาผู้ใช้ (push) — ใช้ userId ของลูกค้า (ต้องเคยเพิ่มเพื่อน/ผูกบัญชี)
export async function pushMessage(to: string, messages: unknown[]): Promise<void> {
  if (!TOKEN) throw new Error('LINE not configured')
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to, messages }),
  })
}

// โหลดไฟล์ที่ลูกค้าส่ง (เช่น รูปสลิป) เป็น Buffer — ใช้ต่อกับ OCR ภายหลัง
export async function getLineContent(messageId: string): Promise<Buffer> {
  if (!TOKEN) throw new Error('LINE not configured')
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error('load content failed')
  return Buffer.from(await res.arrayBuffer())
}
