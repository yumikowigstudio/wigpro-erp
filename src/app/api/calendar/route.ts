import { NextRequest, NextResponse } from 'next/server'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  formatAppointmentEvent,
} from '@/lib/google-calendar'
import { db } from '@/lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'

// ดึง Google tokens ของ user จาก Firestore
async function getUserTokens(userId: string) {
  const snap = await getDoc(doc(db, 'users', userId))
  if (!snap.exists()) throw new Error('User not found')
  const data = snap.data()
  if (!data.googleConnected || !data.googleAccessToken) {
    throw new Error('Google Calendar not connected')
  }
  return {
    accessToken:  data.googleAccessToken  as string,
    refreshToken: data.googleRefreshToken as string,
  }
}

// POST /api/calendar — สร้าง event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, appointmentId, appointment } = body

    const { accessToken, refreshToken } = await getUserTokens(userId)
    const eventInput = formatAppointmentEvent(appointment)
    const eventId    = await createCalendarEvent(accessToken, refreshToken, eventInput)

    // บันทึก eventId กลับลง appointment ใน Firestore
    if (appointmentId) {
      await updateDoc(doc(db, 'appointments', appointmentId), {
        googleEventId:   eventId,
        googleCalSynced: true,
      })
    }

    return NextResponse.json({ success: true, eventId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

// PATCH /api/calendar — อัพเดท event
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, eventId, appointment } = body

    const { accessToken, refreshToken } = await getUserTokens(userId)
    const eventInput = formatAppointmentEvent(appointment)
    await updateCalendarEvent(accessToken, refreshToken, eventId, eventInput)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}

// DELETE /api/calendar?userId=xxx&eventId=yyy
export async function DELETE(request: NextRequest) {
  try {
    const userId  = request.nextUrl.searchParams.get('userId')!
    const eventId = request.nextUrl.searchParams.get('eventId')!

    const { accessToken, refreshToken } = await getUserTokens(userId)
    await deleteCalendarEvent(accessToken, refreshToken, eventId)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 400 })
  }
}
