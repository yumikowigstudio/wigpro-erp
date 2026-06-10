import { google } from 'googleapis'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const REDIRECT_URI  = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`

// สร้าง OAuth2 client
export function createOAuth2Client(accessToken?: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
  if (accessToken) {
    oauth2Client.setCredentials({
      access_token:  accessToken,
      refresh_token: refreshToken,
    })
  }
  return oauth2Client
}

// URL สำหรับ Login กับ Google
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    state: state ?? '',
  })
}

// แลก code เป็น tokens
export async function getTokensFromCode(code: string) {
  const oauth2Client = createOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

// ===============================================
// Calendar Event Operations
// ===============================================

export interface CalendarEventInput {
  summary:     string        // ชื่อ event
  description: string        // รายละเอียด
  location?:   string        // สถานที่ / สาขา
  startDateTime: string      // ISO string เช่น "2024-06-05T10:00:00+07:00"
  endDateTime:   string      // ISO string
  attendeeEmail?: string     // อีเมลลูกค้า (ถ้ามี)
  calendarId?:   string      // default = 'primary'
  colorId?:      string      // 1-11
}

// สร้าง Event ใน Google Calendar
export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string,
  input: CalendarEventInput,
): Promise<string> {
  const auth = createOAuth2Client(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const attendees = input.attendeeEmail
    ? [{ email: input.attendeeEmail }]
    : []

  const res = await calendar.events.insert({
    calendarId: input.calendarId ?? 'primary',
    requestBody: {
      summary:     input.summary,
      description: input.description,
      location:    input.location,
      colorId:     input.colorId ?? '11', // แดง-ชมพู
      start: {
        dateTime: input.startDateTime,
        timeZone: 'Asia/Bangkok',
      },
      end: {
        dateTime: input.endDateTime,
        timeZone: 'Asia/Bangkok',
      },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },   // แจ้งเตือน 1 ชม.ก่อน
          { method: 'popup', minutes: 1440 },  // แจ้งเตือน 1 วันก่อน
        ],
      },
    },
  })

  return res.data.id!
}

// อัพเดท Event
export async function updateCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  input: Partial<CalendarEventInput>,
  calendarId = 'primary',
): Promise<void> {
  const auth = createOAuth2Client(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const patch: Record<string, unknown> = {}
  if (input.summary)       patch.summary     = input.summary
  if (input.description)   patch.description = input.description
  if (input.location)      patch.location    = input.location
  if (input.startDateTime) patch.start = { dateTime: input.startDateTime, timeZone: 'Asia/Bangkok' }
  if (input.endDateTime)   patch.end   = { dateTime: input.endDateTime,   timeZone: 'Asia/Bangkok' }

  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: patch,
  })
}

// ลบ Event
export async function deleteCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  calendarId = 'primary',
): Promise<void> {
  const auth = createOAuth2Client(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  await calendar.events.delete({ calendarId, eventId })
}

// ดึง Events ในช่วงเวลา
export async function listCalendarEvents(
  accessToken: string,
  refreshToken: string,
  timeMin: string,
  timeMax: string,
  calendarId = 'primary',
) {
  const auth = createOAuth2Client(accessToken, refreshToken)
  const calendar = google.calendar({ version: 'v3', auth })

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  })

  return res.data.items ?? []
}

// ===============================================
// Format appointment เป็น Calendar Event
// ===============================================
export function formatAppointmentEvent(appointment: {
  customerName:  string
  customerPhone: string
  services:      string
  stylistName:   string
  stylistEmail?: string
  date:          string    // YYYY-MM-DD
  startTime:     string    // HH:mm
  endTime:       string    // HH:mm
  branchName:    string
  notes?:        string
}): CalendarEventInput {
  const { date, startTime, endTime } = appointment

  // แปลง offset Bangkok = +07:00
  const start = `${date}T${startTime}:00+07:00`
  const end   = `${date}T${endTime}:00+07:00`

  const description = [
    `👤 ลูกค้า: ${appointment.customerName}`,
    `📞 เบอร์โทร: ${appointment.customerPhone}`,
    `✂️ บริการ: ${appointment.services}`,
    `💇 ช่าง: ${appointment.stylistName}`,
    `🏪 สาขา: ${appointment.branchName}`,
    appointment.notes ? `📝 หมายเหตุ: ${appointment.notes}` : '',
  ].filter(Boolean).join('\n')

  return {
    summary:       `💇 ${appointment.customerName} — ${appointment.services}`,
    description,
    location:      appointment.branchName,
    startDateTime: start,
    endDateTime:   end,
    colorId:       '11', // Tomato (แดง-ชมพู)
    attendeeEmail: appointment.stylistEmail, // ช่างเห็น event ใน calendar ตัวเอง
  }
}
