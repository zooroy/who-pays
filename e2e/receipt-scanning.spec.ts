import path from 'node:path'
import type { Page } from '@playwright/test'
import result from './fixtures/receipt-result.json' with { type: 'json' }
import { expect, test } from './fixtures'
import { createTrip, expenseTicket } from './helpers'

const PHOTO = path.join(import.meta.dirname, 'fixtures', 'receipt.jpg')

/** Answers parse-receipt in the browser so no request reaches the Edge Function or Gemini. */
async function stubParseReceipt(page: Page, status: number, body: unknown) {
  let calls = 0
  await page.route('**/functions/v1/parse-receipt', async (route) => {
    calls += 1
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  })
  const outside: string[] = []
  page.on('request', (request) => {
    if (/googleapis|generativelanguage/.test(request.url())) outside.push(request.url())
  })
  return { calls: () => calls, outside }
}

/** 拍收據 on the trip screen, choosing the fixture photo. */
async function scanReceipt(page: Page) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '拍收據' }).click()
  await (await chooser).setFiles(PHOTO)
}

test.describe('receipt-scanning', () => {
  test('確認畫面 › 確認後儲存', async ({ ownerPage: page }) => {
    const trip = await createTrip(page)
    const stub = await stubParseReceipt(page, 200, result)
    await scanReceipt(page)

    await expect(page.getByRole('heading', { name: '確認收據內容' })).toBeVisible()
    await expect(page.getByLabel('名稱')).toHaveValue('一蘭 新宿店')
    await expect(page.getByLabel('金額', { exact: true }).first()).toHaveValue('1190')
    await expect(page.getByRole('textbox', { name: '品項 1' })).toHaveValue('拉麵')
    await expect(page.getByRole('textbox', { name: '品項 2' })).toHaveValue('加麵')
    await page.getByRole('button', { name: '儲存支出' }).click()

    await expect(page).toHaveURL(new RegExp(`${trip.path}$`))
    await expenseTicket(page, '一蘭 新宿店').click()
    const items = page.getByRole('region', { name: '品項明細' })
    await expect(items).toContainText('ラーメン')
    await expect(items).toContainText('拉麵')
    await expect(items).toContainText('加麵')
    await page.getByText('查看收據照片').click()
    const photo = page.getByRole('img', { name: '一蘭 新宿店的收據，點開看大圖' })
    await expect(photo).toBeVisible()
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)

    expect(stub.calls()).toBe(1)
    expect(stub.outside).toEqual([])
  })

  test('辨識失敗退回手動輸入 › 辨識服務太忙', async ({ ownerPage: page }) => {
    const trip = await createTrip(page)
    const stub = await stubParseReceipt(page, 503, { code: 'MODEL_BUSY' })
    await scanReceipt(page)

    await expect(page.getByText('自動辨識現在太忙，請稍後再試或手動輸入。')).toBeVisible()
    await expect(page.getByRole('heading', { name: '新增支出' })).toBeVisible()
    await expect(page.getByRole('img', { name: '收據照片' })).toBeVisible()
    await page.getByLabel('名稱').fill('拉麵')
    await page.getByLabel('金額', { exact: true }).fill('1190')
    await page.getByRole('button', { name: '儲存支出' }).click()

    await expect(page).toHaveURL(new RegExp(`${trip.path}$`))
    await expenseTicket(page, '拉麵').click()
    await expect(page.getByText('查看收據照片')).toBeVisible()
    expect(stub.calls()).toBe(1)
    expect(stub.outside).toEqual([])
  })
})
