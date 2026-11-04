import { CURRENCIES, parseMoneyInput, type CurrencyCode } from '../../lib/money'
import { hasErrorCode } from '../../lib/identity'
import type { Member, Trip } from '../trip/api'

export interface ExpenseItem {
  name: string
  name_zh: string | null
  qty: number
  unit_price: number | null
  amount: number
  position: number
}
export interface Expense {
  id: string
  title: string
  amount: number
  currency: CurrencyCode
  spent_on: string
  paid_by: string
  updated_by: string
  created_at: string
  receipt_path: string | null
  receipt_raw: unknown
  expense_splits: { member_id: string }[]
  expense_items: ExpenseItem[]
}
export interface ExpenseDraft {
  title: string
  amount: string
  currency: CurrencyCode
  spentOn: string
  paidBy: string
  splitMemberIds: string[]
}
export type ExpenseErrors = Partial<Record<keyof ExpenseDraft, string>>
export const SAVE_ERROR = '儲存失敗，請確認網路連線後再試一次。'
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function initialDraft(
  trip: Trip,
  members: readonly Member[],
  me: string,
  expense?: Expense,
  now = new Date(),
): ExpenseDraft {
  return expense
    ? {
        title: expense.title,
        amount: String(expense.amount / 10 ** CURRENCIES[expense.currency].exponent),
        currency: expense.currency,
        spentOn: expense.spent_on,
        paidBy: expense.paid_by,
        splitMemberIds: expense.expense_splits.map((s) => s.member_id),
      }
    : {
        title: '',
        amount: '',
        currency: trip.default_currency,
        spentOn: localDate(now),
        paidBy: me,
        splitMemberIds: members.map((m) => m.id),
      }
}
export function validateDraft(draft: ExpenseDraft, members: readonly Member[]): ExpenseErrors {
  const errors: ExpenseErrors = {}
  const amount = parseMoneyInput(draft.amount, draft.currency)
  if (!draft.title.trim()) errors.title = '請輸入支出名稱。'
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0)
    errors.amount = '金額必須大於 0，且符合幣別的最小單位。'
  if (!draft.splitMemberIds.length) errors.splitMemberIds = '至少要選擇一位分攤者。'
  if (draft.splitMemberIds.some((id) => !members.some((m) => m.id === id)))
    errors.splitMemberIds = '請重新選擇旅程中的分攤者。'
  if (!members.some((m) => m.id === draft.paidBy)) errors.paidBy = '請選擇付款人。'
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.spentOn) ||
    Number.isNaN(Date.parse(draft.spentOn)) ||
    new Date(draft.spentOn).toISOString().slice(0, 10) !== draft.spentOn
  )
    errors.spentOn = '請輸入有效日期。'
  return errors
}
export function expenseError(error: unknown): { message?: string; fields: ExpenseErrors } {
  if (hasErrorCode(error, 'SPLITTERS_REQUIRED'))
    return { fields: { splitMemberIds: '至少要選擇一位分攤者。' } }
  if (hasErrorCode(error, 'EXPENSE_NOT_FOUND')) return { fields: {}, message: '這筆支出已被刪除。' }
  return { fields: {}, message: SAVE_ERROR }
}
/** Items and photo from a scanned receipt, for a new expense. */
export interface ReceiptPayload {
  items: Omit<ExpenseItem, 'position'>[]
  receipt_path: string
  receipt_raw: unknown
}
export function expensePayload(
  tripId: string,
  memberId: string,
  draft: ExpenseDraft,
  existing?: Expense,
  receipt?: ReceiptPayload,
) {
  const amount = parseMoneyInput(draft.amount, draft.currency)
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('Invalid amount')
  return {
    ...(existing ? { id: existing.id } : {}),
    trip_id: tripId,
    member_id: memberId,
    title: draft.title.trim(),
    amount,
    currency: draft.currency,
    spent_on: draft.spentOn,
    paid_by: draft.paidBy,
    split_member_ids: [...new Set(draft.splitMemberIds)],
    items: receipt
      ? receipt.items
      : existing
        ? [...existing.expense_items]
            .sort((a, b) => a.position - b.position)
            .map(({ name, name_zh, qty, unit_price, amount }) => ({
              name,
              name_zh,
              qty,
              unit_price,
              amount,
            }))
        : [],
    receipt_path: receipt?.receipt_path ?? existing?.receipt_path ?? null,
    receipt_raw: receipt ? receipt.receipt_raw : (existing?.receipt_raw ?? null),
  }
}
export function groupExpenses(expenses: readonly Expense[]) {
  const groups = new Map<string, Expense[]>()
  for (const expense of [...expenses].sort(
    (a, b) =>
      b.spent_on.localeCompare(a.spent_on) ||
      b.created_at.localeCompare(a.created_at) ||
      a.id.localeCompare(b.id),
  )) {
    const group = groups.get(expense.spent_on) ?? []
    group.push(expense)
    groups.set(expense.spent_on, group)
  }
  return [...groups].map(([date, expenses]) => ({ date, expenses }))
}
export function dateLabel(date: string) {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}
