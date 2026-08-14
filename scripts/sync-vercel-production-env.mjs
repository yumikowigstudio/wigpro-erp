import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const envPath = '.env.local'
const raw = fs.readFileSync(envPath, 'utf8')
const env = {}

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
  const index = trimmed.indexOf('=')
  env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '')
}

env.NEXT_PUBLIC_APP_URL = 'https://www.yumikowigstudio.app'

const keys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
  'NEXT_PUBLIC_APP_URL',
]

for (const key of keys) {
  const value = env[key]
  if (!value) {
    console.log(`skip ${key}: empty`)
    continue
  }

  spawnSync('npx', ['vercel', 'env', 'rm', key, 'production', '--yes'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })

  const add = spawnSync('npx', ['vercel', 'env', 'add', key, 'production'], {
    input: `${value}\n`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
  })

  if (add.status !== 0) {
    console.error(`failed ${key}: ${add.stderr || add.stdout}`)
    process.exit(add.status ?? 1)
  }

  console.log(`synced ${key}`)
}
