import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8086') throw new Error('Emulator required')
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const env = await initializeTestEnvironment({ projectId: 'demo-yumiko-qa', firestore: { host: '127.0.0.1', port: 8086, rules: await readFile('firestore.rules', 'utf8') } })
const signup = await fetch('http://127.0.0.1:9096/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-emulator-key', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'album-qa@example.test', password: 'OnlyForEmulator123!', returnSecureToken: true }),
}).then(response => response.json())
if (!signup.localId) throw new Error(JSON.stringify(signup))
const now = new Date()
const originalTitle = 'ชิ้นที่ 1 วิกกึ่งฟู'
const imageUrl = 'http://localhost:3106/icon-192.png?album-qa=fixture'
await env.withSecurityRulesDisabled(async context => {
  const db = context.firestore()
  const seed = {
    [`users/${signup.localId}`]: { companyId: 'co', branchId: 'main', email: 'album-qa@example.test', displayName: 'QA Album', role: 'owner', isActive: true, permissions: [] },
    'companies/co': { name: 'QA Store', status: 'active' },
    'branches/main': { companyId: 'co', name: 'Yumiko QA', code: '00', isMainBranch: true, status: 'active' },
    'system_settings/co': { companyId: 'co', nameTh: 'ร้านทดสอบ' },
    'customers/customer': { companyId: 'co', branchId: 'main', firstName: 'เขมิกา', lastName: 'ศรีวัฒนา', nickname: 'เขม', phone: '0800000000', customerId: 'C-QA001', caseTypes: ['thin_hair'], memberLevel: 'silver', totalPurchase: 18570, points: 300, lineId: 'customer-qa', headCircumference: 54, headFrontBack: 33, status: 'active', createdAt: now },
    'customers/customer-long': { companyId: 'co', branchId: 'main', firstName: 'กัญญ์ณัฏฐ์ธัญญาภรณ์'.repeat(3), lastName: 'ศรีสุวรรณวัฒนกุล'.repeat(3), nickname: 'ชื่อเล่นสำหรับตรวจการตัดบรรทัด'.repeat(2), phone: '0800000000', customerId: 'CUS-' + '1234567890'.repeat(6), caseTypes: ['thin_hair'], memberLevel: 'gold', totalPurchase: 123456789.12, points: 987654321, notes: 'หมายเหตุลูกค้าแบบยาวโดยไม่มีช่องว่าง'.repeat(10), status: 'active', createdAt: now },
  }
  for (let i = 0; i < 24; i++) {
    seed[`customer_work_cases/case-${i}`] = {
      companyId: 'co', customerId: 'customer', branchId: 'main', title: i === 0 ? originalTitle : `ชิ้นที่ ${i + 1} ${i % 3 === 2 ? 'ซ่อมและแก้ทรง' : 'วิกสำหรับออกงาน'}`,
      type: ['custom_wig', 'ready_made', 'repair'][i % 3], notes: 'หมายเหตุชิ้นงานที่ต้องอ่านภายในอัลบั้ม',
      caseDate: new Date(now.getTime() - i * 86400000), status: 'active', createdBy: signup.localId, createdAt: now, updatedAt: now,
    }
  }
  for (const [i, category] of ['before', 'after', 'receipt'].entries()) {
    seed[`customer_images/photo-${i}`] = { companyId: 'co', customerId: 'customer', workCaseId: 'case-0', category, url: `${imageUrl}-${i}`, notes: i === 0 ? 'โน้ตก่อนทำ' : '', caption: `QA ${category}`, imageDate: now, createdAt: now }
  }
  for (const side of ['before', 'after']) {
    seed[`customer_images/order-${side}`] = { companyId: 'co', customerId: 'customer', workCaseId: 'case-0', category: 'wig_order', albumSide: side, url: `${imageUrl}-order-${side}`, caption: `QA order ${side}`, imageDate: now, createdAt: now }
  }
  seed['customer_images/general'] = { companyId: 'co', customerId: 'customer', category: 'other', url: `${imageUrl}-general`, caption: 'QA general', imageDate: now, createdAt: now }
  for (const [path, data] of Object.entries(seed)) await db.doc(path).set(data)
})
await mkdir('test-results', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
let acceptDelete = false
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => acceptDelete ? dialog.accept() : dialog.dismiss())
await page.route('https://api.cloudinary.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ secure_url: `${imageUrl}-upload` }) }))
try {
  await page.goto('http://localhost:3106/login')
  await page.locator('input[type=email]').fill('album-qa@example.test')
  await page.locator('input[type=password]').fill('OnlyForEmulator123!')
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/dashboard', { timeout: 60000 })
  const assertProfileLayout = async () => {
    const heading = page.locator('#customer-name')
    await heading.waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === 'running'))
    const header = page.locator('header[aria-labelledby="customer-name"]')
    assert.equal(await header.locator('.luxury-gradient').count(), 0)
    const geometry = await heading.evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const parent = element.closest('header').getBoundingClientRect()
      const stats = element.closest('header').querySelector('dl').getBoundingClientRect()
      const style = getComputedStyle(element)
      return { inside: bounds.left >= parent.left && bounds.right <= parent.right && bounds.top >= parent.top,
        aboveStats: bounds.bottom <= stats.top, wraps: style.whiteSpace === 'normal',
        fits: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1 }
    })
    if (!geometry.fits) {
      console.log('Heading geometry', await heading.evaluate(element => ({ client: [element.clientWidth, element.clientHeight], scroll: [element.scrollWidth, element.scrollHeight], lineHeight: getComputedStyle(element).lineHeight, font: getComputedStyle(element).fontFamily, text: element.textContent })))
      await page.screenshot({ path: 'test-results/customer-profile-overflow.png' })
    }
    assert.deepEqual(geometry, { inside: true, aboveStats: true, wraps: true, fits: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    assert.equal(await header.evaluate(element => element.scrollWidth > element.clientWidth + 1), false)
  }
  await page.goto('http://localhost:3106/customers/customer')
  await assertProfileLayout()
  await page.screenshot({ path: 'test-results/customer-profile-desktop.png' })
  assert.equal(await page.getByRole('link', { name: 'แก้ไขข้อมูล', exact: true }).getAttribute('href'), '/customers/customer/edit')
  assert.equal(await page.getByRole('link', { name: 'โทร', exact: true }).getAttribute('href'), 'tel:0800000000')
  await page.setViewportSize({ width: 390, height: 844 })
  await assertProfileLayout()
  await page.screenshot({ path: 'test-results/customer-profile-mobile.png' })
  await page.goto('http://localhost:3106/customers/customer-long')
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await assertProfileLayout()
    if (width === 320 || width === 1440) await page.screenshot({ path: `test-results/customer-profile-long-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto('http://localhost:3106/customers/customer?tab=photos')
  const list = page.getByRole('list', { name: 'รายการอัลบั้มชิ้นงาน' })
  await list.getByRole('listitem').last().waitFor()
  assert.equal(await list.getByRole('listitem').count(), 24)
  assert.equal(await page.locator('img[src*="album-qa"]').count(), 0, 'Overview must not render case or general photos')
  assert.equal(await page.getByText('หมายเหตุชิ้นงานที่ต้องอ่านภายในอัลบั้ม', { exact: true }).count(), 0)
  await page.getByLabel('ค้นหาชื่อเคส').fill('กึ่งฟู')
  assert.equal(await list.getByRole('listitem').count(), 1)
  await page.getByLabel('ล้างการค้นหา').click()
  await page.getByLabel('ประเภทเคส', { exact: true }).selectOption('repair')
  assert.equal(await list.getByRole('listitem').count(), 8)
  await page.getByLabel('ประเภทเคส', { exact: true }).selectOption('all')
  await page.getByRole('heading', { name: 'อัลบั้มชิ้นงาน' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/albums-desktop.png' })
  const pageUrl = page.url()
  await page.getByRole('button', { name: `แก้ไขชิ้นงาน ${originalTitle}`, exact: true }).click()
  const listEdit = page.getByRole('dialog', { name: 'แก้ไขชิ้นงาน', exact: true })
  await listEdit.waitFor()
  await page.keyboard.press('Escape')
  await listEdit.waitFor({ state: 'detached' })
  assert.equal(page.url(), pageUrl)
  await page.getByRole('button', { name: `ดูอัลบั้ม ${originalTitle}`, exact: true }).click()
  const gallery = page.getByRole('dialog', { name: `อัลบั้ม ${originalTitle}`, exact: true })
  await gallery.waitFor()
  await gallery.locator('img').first().waitFor()
  assert.equal(await gallery.locator('img').count(), 5)
  const beforeSide = gallery.getByRole('region', { name: 'Before / ก่อนทำ', exact: true })
  const afterSide = gallery.getByRole('region', { name: 'After / หลังทำ', exact: true })
  for (const [side, region] of [['before', beforeSide], ['after', afterSide]]) {
    for (const category of ['ใบเสร็จ', 'ใบออเดอร์วิก', 'อื่นๆ']) {
      assert.equal(await region.getByRole('region', { name: `${category} ${side}`, exact: true }).count(), 1)
    }
    assert.equal(await region.getByRole('button', { name: `ดูรูป QA order ${side}`, exact: true }).count(), 1)
  }
  const beforeBox = await beforeSide.boundingBox()
  const afterBox = await afterSide.boundingBox()
  assert.ok(beforeBox.x + beforeBox.width < afterBox.x && Math.abs(beforeBox.y - afterBox.y) < 1, 'Desktop phases must be side by side')
  const shared = gallery.getByRole('region', { name: 'เอกสารรวมของชิ้นงาน', exact: true })
  assert.equal(await shared.getByRole('button', { name: 'ดูรูป QA receipt', exact: true }).count(), 1)
  await page.waitForFunction(() => [...document.querySelectorAll('dialog[open] img')].every(image => image.complete && image.naturalWidth > 0))
  await page.screenshot({ path: 'test-results/album-open-desktop.png' })
  await gallery.getByRole('button', { name: 'ดูรูป QA before', exact: true }).click()
  await page.getByRole('dialog', { name: 'ดูรูปขนาดใหญ่' }).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await gallery.isVisible(), true, 'Closing a photo must keep the album open')
  await gallery.getByRole('button', { name: 'โน้ต: โน้ตก่อนทำ' }).click()
  const noteDialog = page.getByRole('dialog', { name: 'หมายเหตุรูป', exact: true })
  await noteDialog.locator('textarea').fill('หมายเหตุยาวสำหรับช่าง\nให้ตรวจแนวผมและทรงก่อนส่งมอบ '.repeat(5))
  await noteDialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
  await noteDialog.waitFor({ state: 'detached' })
  await shared.getByRole('button', { name: 'แก้ไขรูป QA receipt', exact: true }).click()
  await noteDialog.getByLabel('ตำแหน่งในอัลบั้ม').selectOption('before')
  await noteDialog.locator('textarea').fill('ใบเสร็จเดิม ไม่สร้างไฟล์ซ้ำ')
  await noteDialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
  await noteDialog.waitFor({ state: 'detached' })
  const beforeReceipt = beforeSide.getByRole('region', { name: 'ใบเสร็จ before', exact: true })
  await beforeReceipt.getByRole('button', { name: 'ดูรูป QA receipt', exact: true }).waitFor()
  assert.equal(await gallery.locator('img').count(), 5, 'Moving a legacy file must not duplicate it')
  await beforeReceipt.getByRole('button', { name: 'แก้ไขรูป QA receipt', exact: true }).click()
  await noteDialog.getByLabel('ตำแหน่งในอัลบั้ม').selectOption('after')
  await noteDialog.getByRole('button', { name: 'บันทึกการแก้ไข' }).click()
  await noteDialog.waitFor({ state: 'detached' })
  await afterSide.getByRole('button', { name: 'ดูรูป QA receipt', exact: true }).waitFor()
  assert.equal(await beforeReceipt.locator('img').count(), 0)
  await gallery.getByRole('button', { name: 'แก้ไขชิ้นงาน', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'แก้ไขชิ้นงาน', exact: true })
  const updatedTitle = `${originalTitle} รอบใหม่`
  await edit.getByLabel('ชื่อชิ้นงาน / อัลบั้ม').fill(updatedTitle)
  await edit.getByRole('button', { name: 'บันทึกการแก้ไขชิ้นงาน' }).click()
  await edit.waitFor({ state: 'detached' })
  const updatedGallery = page.getByRole('dialog', { name: `อัลบั้ม ${updatedTitle}`, exact: true })
  await updatedGallery.getByRole('heading', { name: updatedTitle, exact: true }).waitFor()
  assert.equal(page.url(), pageUrl)
  await updatedGallery.getByRole('button', { name: 'เพิ่มรูป', exact: true }).first().click()
  await updatedGallery.getByLabel('หมวดรูปที่จะเพิ่ม').selectOption('after')
  const chooser = page.waitForEvent('filechooser')
  await updatedGallery.getByRole('button', { name: 'เลือกรูป', exact: true }).click()
  await (await chooser).setFiles('public/icon-192.png')
  await updatedGallery.getByRole('button', { name: `ดูรูป After / หลังทำ - ${updatedTitle}`, exact: true }).waitFor()
  for (const [side, category] of [['before', 'ใบเสร็จ'], ['after', 'อื่นๆ']]) {
    const target = updatedGallery.getByRole('region', { name: `${category} ${side}`, exact: true })
    const uploadChooser = page.waitForEvent('filechooser')
    await target.getByRole('button', { name: 'เพิ่มรูป', exact: true }).click()
    await (await uploadChooser).setFiles('public/icon-192.png')
    await target.locator('img').waitFor()
  }
  await updatedGallery.getByRole('button', { name: 'ปิดอัลบั้ม' }).click()
  assert.equal(await page.locator('img[src*="album-qa"]').count(), 0)
  await page.getByRole('button', { name: /รูปทั่วไป \/ รูปเดิม/ }).click()
  await page.locator('#general-album-images img').waitFor()
  await page.getByRole('button', { name: /รูปทั่วไป \/ รูปเดิม/ }).click()
  await page.getByRole('button', { name: 'ลบชิ้นงาน ชิ้นที่ 24 ซ่อมและแก้ทรง', exact: true }).click()
  assert.equal(await list.getByRole('listitem').count(), 24, 'Dismissed deletion must keep the case')
  acceptDelete = true
  await page.getByRole('button', { name: 'ลบชิ้นงาน ชิ้นที่ 24 ซ่อมและแก้ทรง', exact: true }).click()
  await page.getByRole('button', { name: 'ดูอัลบั้ม ชิ้นที่ 24 ซ่อมและแก้ทรง', exact: true }).waitFor({ state: 'detached' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('ค้นหาชื่อเคส').fill('ชิ้นที่ 1 ')
  const filteredCount = await list.getByRole('listitem').count()
  await page.getByRole('heading', { name: 'อัลบั้มชิ้นงาน' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/albums-mobile.png' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  await page.getByRole('button', { name: `ดูอัลบั้ม ${updatedTitle}`, exact: true }).click()
  await updatedGallery.waitFor()
  await page.screenshot({ path: 'test-results/album-open-mobile.png' })
  const box = await updatedGallery.boundingBox()
  assert.ok(box.width >= 389 && box.height >= 843, 'Mobile album must use the full viewport')
  const closeBox = await updatedGallery.getByRole('button', { name: 'ปิดอัลบั้ม' }).boundingBox()
  assert.ok(closeBox.x + closeBox.width > box.x + box.width - 24, 'Album close button must stay at the top right')
  assert.ok(closeBox.y < box.y + 24)
  assert.equal(await updatedGallery.evaluate(element => element.scrollWidth > element.clientWidth + 1), false)
  await page.keyboard.press('Escape')
  await updatedGallery.waitFor({ state: 'detached' })
  assert.equal(await list.getByRole('listitem').count(), filteredCount, 'Closing must retain the list filter')
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    const photos = await db.collection('customer_images').get()
    assert.equal(photos.size, 9)
    const uploaded = photos.docs.find(photo => photo.data().url.endsWith('-upload') && photo.data().category === 'after').data()
    assert.equal(uploaded.workCaseId, 'case-0')
    assert.equal(uploaded.category, 'after')
    assert.equal(uploaded.albumSide, 'after')
    assert.equal(photos.docs.find(photo => photo.data().url.endsWith('-upload') && photo.data().category === 'receipt').data().albumSide, 'before')
    assert.equal(photos.docs.find(photo => photo.data().url.endsWith('-upload') && photo.data().category === 'other').data().albumSide, 'after')
    const movedReceipt = (await db.doc('customer_images/photo-2').get()).data()
    assert.equal(movedReceipt.albumSide, 'after')
    assert.equal(movedReceipt.url, `${imageUrl}-2`)
    assert.equal(movedReceipt.notes, 'ใบเสร็จเดิม ไม่สร้างไฟล์ซ้ำ')
    assert.match((await db.doc('customer_images/photo-0').get()).data().notes, /ตรวจแนวผม/)
  })
  await page.getByRole('button', { name: 'สร้างชิ้นงาน', exact: true }).click()
  const create = page.getByRole('dialog', { name: 'สร้างชิ้นงานใหม่', exact: true })
  await create.getByLabel('ชื่อชิ้นงาน / อัลบั้ม').fill('วิกชิ้นใหม่สำหรับงานแต่ง')
  await create.getByRole('button', { name: 'บันทึกชิ้นงาน', exact: true }).click()
  await create.waitFor({ state: 'detached' })
  const newGallery = page.getByRole('dialog', { name: 'อัลบั้ม วิกชิ้นใหม่สำหรับงานแต่ง', exact: true })
  await newGallery.getByLabel('หมวดรูปที่จะเพิ่ม').waitFor()
  await newGallery.getByRole('button', { name: 'ปิดอัลบั้ม' }).click()
  assert.equal(await page.getByLabel('ค้นหาชื่อเคส').inputValue(), '')
  assert.equal(await list.getByRole('listitem').count(), 24)
  assert.deepEqual(errors, [])
  console.log('Customer UI passed: profile layout at 320-1440px, compact case list, visible edit/delete, separate Before/After documents, legacy file reassignment without duplication, side-specific uploads, notes, nested dialogs and mobile layout')
} finally {
  await browser.close()
  await env.cleanup()
}
