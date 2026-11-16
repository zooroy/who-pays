import { expect, test } from './fixtures'
import { addExpense, createTrip, expenseTicket, joinTrip } from './helpers'

test.describe('expense-tracking', () => {
  test('新增支出 › 手動新增支出', async ({ ownerPage: page }) => {
    const trip = await createTrip(page, { currency: 'JPY', ownerName: '熊' })
    await page.getByRole('button', { name: '手動新增' }).click()
    await page.getByLabel('名稱').fill('計程車')
    await page.getByLabel('金額', { exact: true }).fill('3000')
    await page.getByLabel('幣別').selectOption('JPY')
    await expect(page.getByRole('radio', { name: '熊' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: '熊' })).toBeChecked()
    await page.getByRole('button', { name: '儲存支出' }).click()

    await expect(page).toHaveURL(new RegExp(`${trip.path}$`))
    await expect(expenseTicket(page, '計程車')).toHaveAccessibleName('計程車，¥3,000，熊付，1 人分')
  })

  test('新增支出 › 金額無效', async ({ ownerPage: page }) => {
    const trip = await createTrip(page)
    for (const amount of ['0', '-500']) {
      await page.goto(`${trip.path}/expenses/new`)
      await page.getByLabel('名稱').fill('計程車')
      await page.getByLabel('金額', { exact: true }).fill(amount)
      await page.getByRole('button', { name: '儲存支出' }).click()

      await expect(page.getByText('金額必須大於 0，且符合幣別的最小單位。')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`${trip.path}/expenses/new$`))
    }
    await page.goto(trip.path)
    await expect(page.getByText('還沒有支出。拍下第一張收據，或手動新增一筆。')).toBeVisible()
  })

  test('修改與刪除支出 › 刪除支出', async ({ ownerPage, friendPage }) => {
    const trip = await createTrip(ownerPage)
    await joinTrip(friendPage, trip, '小貓', '貓')
    await addExpense(ownerPage, trip, '牛肉湯', '3000')
    await ownerPage.getByRole('link', { name: '結算' }).click()
    await expect(ownerPage.getByText('小貓 付給 阿熊')).toBeVisible()

    await ownerPage.getByRole('link', { name: '支出' }).click()
    await expenseTicket(ownerPage, '牛肉湯').click()
    await ownerPage.getByRole('button', { name: '刪除支出' }).click()
    await ownerPage
      .getByRole('region', { name: '確認刪除支出' })
      .getByRole('button', { name: '確定刪除' })
      .click()

    await expect(ownerPage).toHaveURL(new RegExp(`${trip.path}$`))
    await expect(expenseTicket(ownerPage, '牛肉湯')).toHaveCount(0)
    await ownerPage.getByRole('link', { name: '結算' }).click()
    await expect(ownerPage.getByText('小貓 付給 阿熊')).toHaveCount(0)
    await expect(
      ownerPage.getByText('還沒有支出。新增支出後，這裡會算出誰該付給誰。'),
    ).toBeVisible()
  })

  test('即時同步 › 他人新增支出', async ({ ownerPage, friendPage }) => {
    const trip = await createTrip(ownerPage, { ownerName: '熊' })
    await joinTrip(friendPage, trip, '貓', '貓')
    await ownerPage.goto(trip.path)
    await expect(ownerPage.getByText('還沒有支出。拍下第一張收據，或手動新增一筆。')).toBeVisible()

    await addExpense(friendPage, trip, '章魚燒', '600')

    // No reload: the owner's open page must pick it up through Realtime.
    await expect(expenseTicket(ownerPage, '章魚燒')).toBeVisible()
    await ownerPage.getByRole('link', { name: '結算' }).click()
    await expect(ownerPage.getByText('熊 付給 貓')).toBeVisible()
  })
})
