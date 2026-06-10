import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-calendar'

// GET /api/auth/google?userId=xxx
// เริ่ม OAuth flow — redirect ไป Google
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') ?? ''
  const url    = getAuthUrl(userId)
  return NextResponse.redirect(url)
}
