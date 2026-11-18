import { defineConfig, type ReporterDescription } from '@playwright/test'
import { localSupabase } from './e2e/localSupabase'

const supabase = localSupabase()
const PORT = 5174
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [
    ...(isCI
      ? ([['github'], ['html', { open: 'never' }]] satisfies ReporterDescription[])
      : ([['list']] satisfies ReporterDescription[])),
    // reports/e2e.json feeds the Scenario report (scripts/scenario-report.ts).
    ['json', { outputFile: 'reports/e2e.json' }],
  ],
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'zh-TW',
    serviceWorkers: 'block',
    trace: isCI ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !isCI,
    env: {
      VITE_SUPABASE_URL: supabase.url,
      VITE_SUPABASE_ANON_KEY: supabase.anonKey,
    },
  },
})
