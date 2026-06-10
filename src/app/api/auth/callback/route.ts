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

    // ส่ง tokens กลับไปให้ client-side บันทึกเอง
    // (เพราะ server-side ไม่มี Firebase Auth context)
    const redirectUrl = new URL(`${appUrl}/settings`)
    redirectUrl.searchParams.set('tab', 'google')
    redirectUrl.searchParams.set('success', 'true')
    redirectUrl.searchParams.set('uid', userId)
    redirectUrl.searchParams.set('at', tokens.access_token)
    if (tokens.refresh_token) {
      redirectUrl.searchParams.set('rt', tokens.refresh_token)
    }
    if (tokens.expiry_date) {
      redirectUrl.searchParams.set('exp', String(tokens.expiry_date))
    }

    return NextResponse.redirect(redirectUrl.toString())
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(`${appUrl}/settings?tab=google&error=token_exchange_failed`)
  }
}
