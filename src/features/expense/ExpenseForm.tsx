import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Notice, SelectField, TextField } from '../../components'
import { CURRENCIES, isCurrencyCode } from '../../lib/money'
import { tripKey, type Member, type Trip } from '../trip/api'
import { saveExpense } from './api'
import {
  itemDrafts,
  parseItemAmount,
  receiptPrefill,
  totalMismatch,
  type ItemDraft,
  type ReceiptResult,
} from '../receipt/model'
import {
  expenseError,
  expensePayload,
  initialDraft,
  validateDraft,
  type Expense,
  type ExpenseErrors,
  type ReceiptPayload,
} from './model'
import { parseMoneyInput } from '../../lib/money'
import './expense.css'

/** A receipt photo already uploaded for a new expense, with its scan result if any. */
export interface ReceiptAttachment {
  path: string
  /** Local object URL of the compressed photo, for preview. */
  photoUrl: string
  result: ReceiptResult | null
  /** Why scanning failed, shown above the manual form. */
  problem: string | null
}

export function ExpenseForm({
  trip,
  members,
  me,
  expense,
  receipt,
  onCancel,
}: {
  trip: Trip
  members: Member[]
  me: Member
  expense?: Expense
  receipt?: ReceiptAttachment
  /** Called before leaving without saving, e.g. to delete an unsaved photo. */
  onCancel?: () => void
}) {
  const scanned = receipt?.result ?? null
  const [prefill] = useState(() =>
    scanned ? receiptPrefill(scanned, trip.default_currency) : null,
  )
  const [draft, setDraft] = useState(() => {
    const base = initialDraft(trip, members, me.id, expense)
    if (!prefill) return base
    return {
      ...base,
      title: prefill.title,
      amount: prefill.amount,
      currency: prefill.currency,
      spentOn: prefill.spentOn ?? base.spentOn,
    }
  })
  const [items, setItems] = useState<ItemDraft[]>(() => (scanned ? itemDrafts(scanned) : []))
  const [itemError, setItemError] = useState('')
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()
  const navigate = useNavigate()
  const client = useQueryClient()
  const path = `/t/${trip.share_token}`
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const fields = validateDraft(draft, members)
    setErrors(fields)
    setError('')
    const itemAmounts = items.map((item) => parseItemAmount(item.amount, draft.currency))
    const badItems = itemAmounts.some((a) => a === null)
    setItemError(badItems ? '有品項的金額格式不正確，請修正或刪除該品項。' : '')
    if (Object.keys(fields).length || badItems) return
    const attached: ReceiptPayload | undefined = receipt && {
      items: items.map((item, index) => ({
        name: item.name.trim() || item.nameZh.trim() || '品項',
        name_zh: item.nameZh.trim() || null,
        qty: item.qty > 0 ? item.qty : 1,
        unit_price: item.unitPrice === null ? null : Math.round(item.unitPrice),
        amount: itemAmounts[index] ?? 0,
      })),
      receipt_path: receipt.path,
      receipt_raw: scanned,
    }
    setBusy(true)
    try {
      await saveExpense(expensePayload(trip.id, me.id, draft, expense, attached))
      await client.invalidateQueries({ queryKey: tripKey(trip.id) })
      navigate(path)
    } catch (failure) {
      const mapped = expenseError(failure)
      setErrors(mapped.fields)
      setError(mapped.message ?? '')
    } finally {
      setBusy(false)
    }
  }
  const mismatch = scanned
    ? totalMismatch(
        items.map((item) => parseItemAmount(item.amount, draft.currency)),
        scanned,
        parseMoneyInput(draft.amount, draft.currency),
        draft.currency,
      )
    : null
  return (
    <form className="trip-stack" noValidate onSubmit={submit}>
      <h2>{expense ? '編輯支出' : scanned ? '確認收據內容' : '新增支出'}</h2>
      {receipt?.problem && <Notice tone="problem">{receipt.problem}</Notice>}
      {scanned?.confidence === 'low' && <Notice>辨識結果可能不準確，請檢查。</Notice>}
      {prefill?.unsupportedCurrency && (
        <Notice>
          收據的幣別是 {prefill.unsupportedCurrency}，目前只支援新台幣和日圓，請確認幣別與金額。
        </Notice>
      )}
      {mismatch && <Notice>品項加總與總額差 {mismatch}</Notice>}
      {receipt && (
        <details className="expense-photo" open={!scanned}>
          <summary>查看收據照片</summary>
          <img className="expense-receipt" src={receipt.photoUrl} alt="收據照片" />
        </details>
      )}
      <TextField
        label="名稱"
        value={draft.title}
        error={errors.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <div className="expense-amount-row">
        <TextField
          label="金額"
          inputMode="decimal"
          value={draft.amount}
          error={errors.amount}
          onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
        />
        <SelectField
          label="幣別"
          value={draft.currency}
          onChange={(e) => {
            if (isCurrencyCode(e.target.value)) setDraft({ ...draft, currency: e.target.value })
          }}
        >
          {Object.values(CURRENCIES).map((c) => (
            <option value={c.code} key={c.code}>
              {c.label} {c.code}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField
        label="日期"
        type="date"
        value={draft.spentOn}
        error={errors.spentOn}
        onChange={(e) => setDraft({ ...draft, spentOn: e.target.value })}
      />
      {items.length > 0 && (
        <fieldset className="expense-fieldset">
          <legend>品項（只做紀錄，不影響分帳）</legend>
          <ul className="expense-items">
            {items.map((item, index) => (
              <li key={item.key} className="expense-item">
                {item.name && item.name !== item.nameZh && (
                  <p className="expense-translation">{item.name}</p>
                )}
                <div className="expense-item__fields">
                  <TextField
                    label={`品項 ${index + 1}`}
                    value={item.nameZh}
                    onChange={(e) =>
                      setItems(
                        items.map((i) =>
                          i.key === item.key ? { ...i, nameZh: e.target.value } : i,
                        ),
                      )
                    }
                  />
                  <TextField
                    label="金額"
                    inputMode="text"
                    value={item.amount}
                    error={
                      parseItemAmount(item.amount, draft.currency) === null
                        ? '格式不正確'
                        : undefined
                    }
                    onChange={(e) =>
                      setItems(
                        items.map((i) =>
                          i.key === item.key ? { ...i, amount: e.target.value } : i,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  variant="quiet"
                  onClick={() => setItems(items.filter((i) => i.key !== item.key))}
                  aria-label={`刪除品項 ${index + 1}`}
                >
                  刪除這個品項
                </Button>
              </li>
            ))}
          </ul>
          {itemError && <p role="alert">{itemError}</p>}
        </fieldset>
      )}
      <fieldset
        className="expense-fieldset"
        aria-describedby={errors.paidBy ? `${id}-payer-error` : undefined}
      >
        <legend>付款人</legend>
        <div className="expense-choices">
          {members.map((m) => (
            <label key={m.id} className="expense-choice">
              <input
                type="radio"
                name={`${id}-payer`}
                checked={draft.paidBy === m.id}
                onChange={() => setDraft({ ...draft, paidBy: m.id })}
              />
              <Avatar avatarId={m.avatar_id} decorative />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
        {errors.paidBy && (
          <p id={`${id}-payer-error`} role="alert">
            {errors.paidBy}
          </p>
        )}
      </fieldset>
      <fieldset
        className="expense-fieldset"
        aria-describedby={errors.splitMemberIds ? `${id}-split-error` : undefined}
      >
        <legend>分攤者</legend>
        <Button
          variant="quiet"
          onClick={() => setDraft({ ...draft, splitMemberIds: members.map((m) => m.id) })}
        >
          全選
        </Button>
        <div className="expense-choices">
          {members.map((m) => (
            <label key={m.id} className="expense-choice">
              <input
                type="checkbox"
                checked={draft.splitMemberIds.includes(m.id)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    splitMemberIds: e.target.checked
                      ? [...draft.splitMemberIds, m.id]
                      : draft.splitMemberIds.filter((id) => id !== m.id),
                  })
                }
              />
              <Avatar avatarId={m.avatar_id} decorative />
              <span>{m.name}</span>
            </label>
          ))}
        </div>
        {errors.splitMemberIds && (
          <p id={`${id}-split-error`} role="alert">
            {errors.splitMemberIds}
          </p>
        )}
      </fieldset>
      {error && <Notice tone="problem">{error}</Notice>}
      <Button type="submit" busy={busy}>
        {expense ? '儲存變更' : '儲存支出'}
      </Button>
      <Button
        variant="quiet"
        disabled={busy}
        onClick={() => {
          onCancel?.()
          navigate(path)
        }}
      >
        取消
      </Button>
    </form>
  )
}
