import { NextRequest, NextResponse } from 'next/server'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  formatAppointmentEvent,
} from '@/lib/google-calendar'

// ดึง Google tokens จาก request header (client เป็นคนส่งมา)
// — ทำแบบนี้เพื่อเลี่ยงการอ่าน Firestore ฝั่ง server ด้วย client SDK ที่ไม่มี
//   auth context (จะติด firestore.rules) client ที่ login แล้วอ่าน token ของ
//   ตัวเองได้อยู่แล้ว จึงส่งต่อมาให้ route คุยกับ Google โดยตรง
function getTokens(request: NextRequest) {
  const accessToken  = request.headers.get('x-g-at')
  const refreshToken = request.headers.get('x-g-rt') ?? ''
  if (!accessToken) throw new Error('Google Calendar not connected')
  return { accessToken, refreshToken }
}

// POST /api/calendar — สร้าง event (คืน eventId ให้ client เขียนกลับ Firestore เอง)
export async function POST(request: NextRequest) {
  try {
    const { appointment } = await request.json()
    const { accessToken, refreshToken } = getTokens(request)
    const eventId = await createCalendarEvent(accessToken, refreshToken, formatAppointmentEvent(appointment))
    return NextResponse.json({ success: true, eventId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

// PATCH /api/calendar — อัพเดท event
export async function PATCH(request: NextRequest) {
  try {
    const { eventId, appointment } = await request.json()
    const { accessToken, refreshToken } = getTokens(request)
    await updateCalendarEvent(accessToken, refreshToken, eventId, formatAppointmentEvent(appointment))
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

// DELETE /api/calendar?eventId=yyy  (tokens อยู่ใน header)
export async function DELETE(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get('eventId')!
    const { accessToken, refreshToken } = getTokens(request)
    await deleteCalendarEvent(accessToken, refreshToken, eventId)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
