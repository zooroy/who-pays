/** Test-only owner for the local Supabase used by E2E (never a real account). */
export const E2E_OWNER = {
  email: 'e2e-owner@example.test',
  password: 'e2e-local-owner-pass',
} as const
