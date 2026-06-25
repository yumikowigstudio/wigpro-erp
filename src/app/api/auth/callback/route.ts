import { NextRequest, NextResponse } from 'next/server'
import { getTokensFromCode } from '@/lib/google-calendar'

// GET /api/auth/callback?code=xxx&state=userId
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code   = searchParams.get('code')
  const userId = searchParams.get('state') ?? ''
  const error  = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/settings?tab=google&error=access_denied`)
  }

  try {
    // แลก code เป็น tokens
    const tokens = await getTokensFromCode(code)

    if (!tokens.access_token) {
      throw new Error('No access token received')
    }

    // ส่ง tokens กลับไปให้ client-side บันทึกเอง (server ไม่มี Firebase Auth context)
    // ⚠️ ใส่ token ไว้ใน URL fragment (#) ไม่ใช่ query string (?) เพราะ fragment
    // ไม่ถูกส่งไปยัง server, ไม่ติด Referer header และไม่เข้า access log
    // ฝั่ง settings จะอ่านจาก location.hash แล้วลบทิ้งทันทีหลังบันทึก
    const params = new URLSearchParams()
    params.set('uid', userId)
    params.set('at', tokens.access_token)
    if (tokens.refresh_token) params.set('rt', tokens.refresh_token)
    if (tokens.expiry_date)   params.set('exp', String(tokens.expiry_date))

    return NextResponse.redirect(`${appUrl}/settings?tab=google#${params.toString()}`)
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(`${appUrl}/settings?tab=google&error=token_exchange_failed`)
  }
}
