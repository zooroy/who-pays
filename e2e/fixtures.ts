import { test as base, type Page } from '@playwright/test'
import { loginAsOwner } from './helpers'

type Fixtures = {
  /** Signed in as the E2E owner, in its own browser context. */
  ownerPage: Page
  /** A brand-new friend (anonymous user), in another browser context. */
  friendPage: Page
}

export const test = base.extend<Fixtures>({
  ownerPage: async ({ browser }, provide) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginAsOwner(page)
    await page.waitForURL('/')
    await provide(page)
    await context.close()
  },
  friendPage: async ({ browser }, provide) => {
    const context = await browser.newContext()
    await provide(await context.newPage())
    await context.close()
  },
})

export { expect } from '@playwright/test'
