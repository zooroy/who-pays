import { expect, type Page } from '@playwright/test'
import { E2E_OWNER } from './fixtures/owner'

/** A trip name no other test uses, so tests can run in parallel on one database. */
export function uniqueTripName(base = '台南之旅'): string {
  return `E2E ${base} ${Math.random().toString(36).slice(2, 6)}`
}

/** Signs in as the E2E owner through the 擁有者登入 page. */
export async function loginAsOwner(page: Page, password: string = E2E_OWNER.password) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_OWNER.email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入' }).click()
}

export type CreatedTrip = { name: string; path: string }

/**
 * Creates a trip as the (already signed-in) owner and returns its path `/t/<token>`.
 * Friends join through the same path; the shared link only adds `?openExternalBrowser=1`.
 */
export async function createTrip(
  page: Page,
  { name = uniqueTripName(), currency = 'JPY', ownerName = '阿熊' } = {},
): Promise<CreatedTrip> {
  await page.goto('/new')
  await page.getByLabel('旅程名稱').fill(name)
  await page.getByLabel('主要貨幣').selectOption(currency)
  await page.getByLabel('你的名字（選填）').fill(ownerName)
  await page.getByRole('button', { name: '建立旅程' }).click()
  await expect(page).toHaveURL(/\/t\/[^/]+$/)
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
  return { name, path: new URL(page.url()).pathname }
}

/** Opens the trip link as a new (anonymous) friend and joins with the given avatar. */
export async function joinTrip(page: Page, trip: CreatedTrip, name: string, avatar: string) {
  await page.goto(`${trip.path}?openExternalBrowser=1`)
  await expect(page.getByRole('heading', { name: '加入旅程' })).toBeVisible()
  await page.getByLabel('名字（選填）').fill(name)
  await page.getByRole('button', { name: avatar, exact: true }).click()
  await page.getByRole('button', { name: '加入旅程' }).click()
  await expect(page.getByRole('button', { name: '手動新增' })).toBeVisible()
}

/** Adds an expense with the form defaults (paid by me, split by everyone, trip currency). */
export async function addExpense(page: Page, trip: CreatedTrip, title: string, amount: string) {
  await page.goto(trip.path)
  await page.getByRole('button', { name: '手動新增' }).click()
  await page.getByLabel('名稱').fill(title)
  await page.getByLabel('金額', { exact: true }).fill(amount)
  await page.getByRole('button', { name: '儲存支出' }).click()
  await expect(expenseTicket(page, title)).toBeVisible()
}

/** The expense ticket in the list, whose accessible name starts with the title. */
export function expenseTicket(page: Page, title: string) {
  return page.getByRole('button', { name: new RegExp(`^${title}，`) })
}
