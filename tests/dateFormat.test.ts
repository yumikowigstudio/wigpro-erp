import test from 'node:test'
import assert from 'node:assert/strict'
import { displayDateToIso, formatThaiReceiptDate, isoDateToDisplay, maskDisplayDate } from '../src/lib/dateFormat'
import { formatDateTime } from '../src/lib/utils'

test('date input converts between ISO storage and day/month/year display', () => {
  assert.equal(isoDateToDisplay('2026-10-06'), '06/10/2026')
  assert.equal(displayDateToIso('06/10/2026'), '2026-10-06')
  assert.equal(maskDisplayDate('06102026'), '06/10/2026')
})

test('date input rejects impossible calendar dates', () => {
  assert.equal(displayDateToIso('31/02/2026'), null)
  assert.equal(isoDateToDisplay('2026-02-31'), '')
})

test('receipt date uses fixed day/month/Buddhist-year format', () => {
  assert.equal(formatThaiReceiptDate('2026-09-11'), '11/09/2569')
})

test('activity timestamps with incomplete legacy data do not crash the page', () => {
  assert.equal(formatDateTime({} as Date), '-')
  assert.equal(formatDateTime('not-a-date'), '-')
})
