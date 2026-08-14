import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
  const index = trimmed.indexOf('=')
  env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '')
}

const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
    returnSecureToken: true,
  }),
})

const data = await res.json()
console.log(JSON.stringify({
  ok: !!data.localId,
  localId: data.localId,
  email: data.email,
  error: data.error?.message,
}, null, 2))
