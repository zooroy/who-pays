import { createClient } from '@supabase/supabase-js'
import { expect, test } from './fixtures'
import { addExpense, createTrip, joinTrip, loginAsOwner } from './helpers'
import { localSupabase } from './localSupabase'

/** Counts trips with this name straight from the local database. */
async function tripsNamed(name: string): Promise<number> {
  const { url, serviceRoleKey } = localSupabase()
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const { count, error } = await admin
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('name', name)
  if (error) throw error
  return count ?? 0
}

test.describe('owner-account', () => {
  test('擁有者登入 › 擁有者登入', async ({ ownerPage, page }) => {
    const trip = await createTrip(ownerPage) // so the home page lists at least one trip

    await loginAsOwner(page)
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: '我的旅程', level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: `開啟${trip.name}` })).toBeVisible()
    await expect(page.getByRole('button', { name: '登出' })).toBeVisible()
  })

  test('擁有者登入 › 密碼錯誤', async ({ page }) => {
    await loginAsOwner(page, 'wrong-password')

    await expect(page.getByText('email 或密碼不正確。')).toBeVisible()
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('heading', { name: '擁有者登入' })).toBeVisible()
  })

  test('只有擁有者能建立旅程 › 朋友無法建立旅程', async ({ ownerPage, friendPage }) => {
    const trip = await createTrip(ownerPage)
    await joinTrip(friendPage, trip, '小華', '貓')

    await friendPage.goto('/')
    await expect(friendPage.getByRole('button', { name: `開啟${trip.name}` })).toBeVisible()
    await expect(friendPage.getByRole('button', { name: /建立/ })).toHaveCount(0)
    await expect(friendPage.getByRole('button', { name: '擁有者登入' })).toBeVisible()
  })

  test('刪除旅程 › 擁有者刪除旅程', async ({ ownerPage: page }) => {
    const doomed = await createTrip(page)
    await addExpense(page, doomed, '牛肉湯', '300')
    const kept = await createTrip(page)

    await page.goto('/')
    await page.getByRole('button', { name: '編輯' }).click()
    await page.getByRole('button', { name: new RegExp(`^刪除\\s*${doomed.name}$`) }).click()
    const confirm = page.getByRole('region', { name: `確認刪除${doomed.name}` })
    await expect(confirm).toContainText('所有支出、還款、成員與收據照片，無法復原')
    await confirm.getByRole('button', { name: `刪除${doomed.name}` }).click()

    await expect(page.getByText(doomed.name)).toHaveCount(0)
    await expect(page.getByText(kept.name, { exact: true }).first()).toBeVisible()
    expect(await tripsNamed(doomed.name)).toBe(0)
    expect(await tripsNamed(kept.name)).toBe(1)
  })

  test('刪除旅程 › 取消刪除', async ({ ownerPage: page }) => {
    const trip = await createTrip(page)

    await page.goto('/')
    await page.getByRole('button', { name: '編輯' }).click()
    await page.getByRole('button', { name: new RegExp(`^刪除\\s*${trip.name}$`) }).click()
    const confirm = page.getByRole('region', { name: `確認刪除${trip.name}` })
    await confirm.getByRole('button', { name: '取消' }).click()

    await expect(confirm).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: new RegExp(`^刪除\\s*${trip.name}$`) }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '完成' })).toBeVisible()
    expect(await tripsNamed(trip.name)).toBe(1)
  })
})
