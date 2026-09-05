import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8086') throw new Error('Emulator required')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const env = await initializeTestEnvironment({ projectId: 'demo-yumiko-qa', firestore: { host: '127.0.0.1', port: 8086, rules: await readFile('firestore.rules', 'utf8') } })
const signup = await fetch('http://127.0.0.1:9096/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'qa@example.test', password: 'OnlyForEmulator123!', returnSecureToken: true }) }).then(response => response.json())
if (!signup.localId) throw new Error(JSON.stringify(signup))
const now = new Date()
await env.withSecurityRulesDisabled(async context => {
  const db = context.firestore()
  const seed = {
    [`users/${signup.localId}`]: { companyId: 'co', branchId: 'main', email: 'qa@example.test', displayName: 'QA Cashier', role: 'owner', isActive: true, permissions: [] },
    'companies/co': { name: 'QA Store', status: 'active' },
    'branches/main': { companyId: 'co', name: 'Yumiko Wig Studio QA', code: '00', isMainBranch: true, status: 'active' },
    'system_settings/co': { companyId: 'co', nameTh: 'ร้านทดสอบ', allowNegativeStock: false },
    'system_settings/co_tax': { companyId: 'co' },
    'products/p': { companyId: 'co', branchId: 'main', name: 'สินค้าทดสอบ', sku: 'QA001', sellingPrice: 100, costPrice: 20, isActive: true, stockQty: 10, minStockAlert: 2, images: [], createdAt: now },
    'inventory/p_main': { companyId: 'co', branchId: 'main', productId: 'p', quantity: 10 },
    'customers/customer': { companyId: 'co', branchId: 'main', firstName: 'ทดสอบ', lastName: 'ลูกค้า', phone: '0800000000', customerId: 'C-QA001', createdAt: now },
    'deposits/dep': { companyId: 'co', branchId: 'main', depositNo: 'DEP-QA-001', customerId: 'customer', customerName: 'ทดสอบ ลูกค้า', totalAmount: 100, depositAmount: 30, paidAmount: 50, remainingAmount: 50, status: 'deposited', items: [{ productId: 'p', name: 'สินค้าทดสอบ', quantity: 1, unitPrice: 100, total: 100 }], paymentHistory: [{ id: 'initial', amount: 30, method: 'cash', confirmed: true, receivedAt: now }, { id: 'second', amount: 20, method: 'cash', confirmed: true, receivedAt: now }], createdAt: now },
  }
  for (const [path, data] of Object.entries(seed)) await db.doc(path).set(data)
})
await mkdir('test-results', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
try {
  await page.goto('http://localhost:3106/login')
  await page.locator('input[type=email]').fill('qa@example.test')
  await page.locator('input[type=password]').fill('OnlyForEmulator123!')
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/dashboard', { timeout: 60000 })
  await page.goto('http://localhost:3106/pos')
  await page.getByText('สินค้าทดสอบ', { exact: true }).first().click()
  await page.getByRole('button', { name: 'พักบิล', exact: true }).click()
  await page.getByRole('button', { name: 'บิลที่พัก (1)' }).click()
  await page.getByRole('button', { name: /ลูกค้าทั่วไป/ }).last().click()
  await page.waitForTimeout(500)
  assert.equal(await page.locator('#pos-cart-panel').getByText('สินค้าทดสอบ', { exact: true }).count(), 1)
  await page.reload()
  await page.getByRole('button', { name: 'เรียกคืน', exact: true }).click()
  assert.equal(await page.locator('#pos-cart-panel').getByText('สินค้าทดสอบ', { exact: true }).count(), 1)
  await page.screenshot({ path: 'test-results/pos-desktop.png', fullPage: true })
  await page.getByLabel('ค้นหาทั้งระบบ').fill('0800')
  await page.getByRole('link', { name: /ทดสอบ ลูกค้า/ }).first().waitFor()
  await page.getByLabel('ค้นหาทั้งระบบ').fill('DEP-QA')
  await page.getByRole('link', { name: /DEP-QA-001/ }).click()
  await page.waitForURL('**/deposits?q=*')
  await page.getByRole('link', { name: 'เปิดบิลปิดมัดจำ' }).click()
  await page.waitForURL('**/pos?depositId=dep')
  await page.getByText(/โหลด DEP-QA-001 แล้ว/).first().waitFor()
  await page.getByRole('button', { name: /ไปชำระเงิน/ }).first().click()
  await page.getByText(/หักมัดจำ/).first().waitFor()
  await page.screenshot({ path: 'test-results/deposit-checkout.png', fullPage: true })
  await page.keyboard.press('Escape')
  await page.goto('http://localhost:3106/reports')
  await page.getByText('รับสุทธิ', { exact: false }).first().waitFor()
  await page.screenshot({ path: 'test-results/reports-desktop.png', fullPage: true })
  await page.goto('http://localhost:3106/accounting')
  await page.getByRole('heading', { name: 'บัญชีการเงิน' }).waitFor()
  await page.getByText('เงินรับสุทธิ', { exact: true }).waitFor()
  await page.screenshot({ path: 'test-results/accounting-desktop.png', fullPage: true })
  await page.goto('http://localhost:3106/activity-log')
  await page.getByRole('heading', { name: 'บันทึกกิจกรรม' }).waitFor()
  await page.screenshot({ path: 'test-results/activity-log.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://localhost:3106/pos')
  await page.getByRole('button', { name: 'พักบิล', exact: true }).waitFor()
  await page.screenshot({ path: 'test-results/pos-mobile.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Mobile page must not overflow horizontally')
  assert.deepEqual(errors, [])
  console.log('UI smoke passed: park/recover, global search, deposit checkout, reports, activity log, mobile layout')
} finally {
  await browser.close()
  await env.cleanup()
}
