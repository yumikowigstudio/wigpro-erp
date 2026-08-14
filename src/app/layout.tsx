import type { Metadata, Viewport } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const sarabun = Sarabun({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'thai'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  applicationName: 'Lunexa',
  title: 'ระบบบริหารร้านวิกผมและร้านตัดผม',
  description: 'ระบบบริหารจัดการร้านวิกผมและร้านตัดผมครบวงจร รองรับหลายสาขา',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Lunexa',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f472b6',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
