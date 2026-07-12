import { NextRequest, NextResponse } from 'next/server'
import { verifyLineSignature, replyMessage, textMessage, lineConfigured } from '@/lib/line'

// URL นี้คือ Webhook URL ที่ต้องใส่ใน LINE Developers Console:
//   https://<โดเมน-vercel>/api/line/webhook

interface LineEvent {
  type: string
  replyToken?: string
  message?: { type: string; text?: string; id?: string }
  source?: { userId?: string }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()

  // ยังไม่ได้ตั้งค่า LINE → ตอบ 200 เฉยๆ (ให้ LINE verify ผ่าน แต่ไม่ทำอะไร)
  if (!lineConfigured()) return NextResponse.json({ ok: true, note: 'LINE not configured' })

  const sig = req.headers.get('x-line-signature')
  if (!verifyLineSignature(raw, sig)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: { events?: LineEvent[] }
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  for (const event of body.events ?? []) {
    try {
      if (event.type === 'follow' && event.replyToken) {
        await replyMessage(event.replyToken, [
          textMessage('ขอบคุณที่เพิ่มเพื่อนค่ะ 💗 พิมพ์ "จองคิว" เพื่อนัดหมาย หรือส่งสลิปเพื่อยืนยันการชำระเงินได้เลยค่ะ'),
        ])
      } else if (event.type === 'message' && event.message?.type === 'text' && event.replyToken) {
        const t = (event.message.text ?? '').trim()
        let reply = 'สวัสดีค่ะ 🌸 พิมพ์ "จองคิว" เพื่อนัดหมาย · "โปรโมชั่น" ดูโปรฯ · หรือส่งสลิปเพื่อยืนยันการชำระเงินค่ะ'
        if (/จอง|คิว|นัด/.test(t)) reply = 'รับทราบค่ะ 📅 กรุณาแจ้ง วัน-เวลา และบริการที่ต้องการ ทางร้านจะติดต่อยืนยันคิวให้ค่ะ'
        else if (/โปร|ราคา|โปรโมชั่น/.test(t)) reply = 'ดูโปรโมชั่นและบริการล่าสุดได้ที่ร้านเลยค่ะ ✨ หรือสอบถามแอดมินได้ตลอดนะคะ'
        await replyMessage(event.replyToken, [textMessage(reply)])
      } else if (event.type === 'message' && event.message?.type === 'image' && event.replyToken) {
        // รับรูปสลิป — ตอบรับก่อน (ต่อ OCR ยืนยันอัตโนมัติในเฟสถัดไป)
        await replyMessage(event.replyToken, [
          textMessage('ได้รับสลิปแล้วค่ะ 🧾 ทางร้านกำลังตรวจสอบการชำระเงิน จะแจ้งยืนยันให้เร็วที่สุดค่ะ'),
        ])
      }
    } catch (e) {
      console.error('LINE event error:', e)
    }
  }
  return NextResponse.json({ ok: true })
}

// LINE บางครั้งเรียก GET ตอน verify — ตอบ 200
export async function GET() {
  return NextResponse.json({ ok: true, service: 'line-webhook' })
}
