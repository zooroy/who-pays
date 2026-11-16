import { expect, test } from './fixtures'
import { addExpense, createTrip, expenseTicket, joinTrip, uniqueTripName } from './helpers'

test.describe('trip-membership', () => {
  test('建立旅程 › 成功建立旅程', async ({ ownerPage: page }) => {
    const name = uniqueTripName('東京 2026')
    await page.goto('/new')
    await page.getByLabel('旅程名稱').fill(name)
    await page.getByLabel('主要貨幣').selectOption('JPY')
    await page.getByRole('button', { name: '熊', exact: true }).click()
    await page.getByRole('button', { name: '建立旅程' }).click()

    await expect(page).toHaveURL(/\/t\/[^/]+$/)
    await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible()
    await page.getByRole('button', { name: '檢視成員列表' }).click()
    await expect(page.getByRole('heading', { name: '成員（1 人）' })).toBeVisible()
    await expect(page.getByText('熊（你）')).toBeVisible()
  })

  test('透過連結加入 › 新成員加入', async ({ ownerPage, friendPage }) => {
    const trip = await createTrip(ownerPage)
    await joinTrip(friendPage, trip, '小華', '貓')

    await expect(friendPage.getByRole('heading', { name: trip.name, level: 1 })).toBeVisible()
    await friendPage.getByRole('button', { name: '檢視成員列表' }).click()
    await expect(friendPage.getByRole('heading', { name: '成員（2 人）' })).toBeVisible()
    await expect(friendPage.getByText('小華（你）')).toBeVisible()
  })

  test('頭像唯一 › 頭像已被選走', async ({ ownerPage, friendPage }) => {
    const trip = await createTrip(ownerPage) // the owner takes 熊
    await friendPage.goto(trip.path)
    await expect(friendPage.getByRole('heading', { name: '加入旅程' })).toBeVisible()

    await expect(friendPage.getByRole('button', { name: /^熊\s*（已被選走）$/ })).toBeDisabled()
    await expect(friendPage.getByRole('button', { name: '貓', exact: true })).toBeEnabled()
  })

  test('回到上一層 › 從支出明細回到列表', async ({ ownerPage: page }) => {
    const trip = await createTrip(page, { name: uniqueTripName('台南之旅') })
    await addExpense(page, trip, '牛肉湯', '300')
    await expenseTicket(page, '牛肉湯').click()
    await expect(page.getByRole('button', { name: '編輯支出' })).toBeVisible()

    await page.getByRole('link', { name: `回到${trip.name}` }).click()
    await expect(page).toHaveURL(new RegExp(`${trip.path}$`))
    await expect(expenseTicket(page, '牛肉湯')).toBeVisible()
  })
})
