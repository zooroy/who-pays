import { expect, test } from './fixtures'
import { addExpense, createTrip, joinTrip } from './helpers'

test.describe('settlement', () => {
  test('最少轉帳建議 › 產生轉帳建議', async ({ ownerPage, friendPage, browser }) => {
    const trip = await createTrip(ownerPage, { currency: 'JPY', ownerName: '熊' })
    await joinTrip(friendPage, trip, '貓', '貓')
    const penguinContext = await browser.newContext()
    await joinTrip(await penguinContext.newPage(), trip, '企鵝', '企鵝')
    await penguinContext.close()

    // 熊 pays ¥300 split by three: 熊 +200, 貓 -100, 企鵝 -100.
    await addExpense(ownerPage, trip, '便利商店', '300')
    await ownerPage.getByRole('link', { name: '結算' }).click()

    const transfers = ownerPage.getByRole('region', { name: '轉帳建議' })
    await expect(transfers.getByRole('button', { name: /^標記已付：/ })).toHaveCount(2)
    await expect(transfers.getByRole('button', { name: '標記已付：貓 付給 熊 ¥100' })).toBeVisible()
    await expect(
      transfers.getByRole('button', { name: '標記已付：企鵝 付給 熊 ¥100' }),
    ).toBeVisible()
  })

  test('標記已付 › 標記已付', async ({ ownerPage, friendPage }) => {
    const trip = await createTrip(ownerPage, { currency: 'JPY', ownerName: '熊' })
    await joinTrip(friendPage, trip, '貓', '貓')
    await addExpense(ownerPage, trip, '燒肉', '8400')

    await friendPage.goto(`${trip.path}/settle`)
    await friendPage.getByRole('button', { name: '標記已付：貓 付給 熊 ¥4,200' }).click()

    await expect(friendPage.getByRole('img', { name: /^已付/ })).toBeVisible()
    const records = friendPage.getByRole('region', { name: '還款紀錄' })
    await expect(records).toContainText('貓 付給 熊')
    await expect(records).toContainText('¥4,200')
    await expect(friendPage.getByRole('button', { name: /^標記已付：/ })).toHaveCount(0)
    await expect(friendPage.getByRole('heading', { name: '全部結清' })).toBeVisible()
  })
})
