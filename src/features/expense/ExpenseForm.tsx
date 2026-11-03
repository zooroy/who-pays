import { useId, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, Notice, SelectField, TextField } from '../../components'
import { CURRENCIES, isCurrencyCode } from '../../lib/money'
import { tripKey, type Member, type Trip } from '../trip/api'
import { saveExpense } from './api'
import {
  expenseError,
  expensePayload,
  initialDraft,
  validateDraft,
  type Expense,
  type ExpenseErrors,
} from './model'
import './expense.css'

export function ExpenseForm({
  trip,
  members,
  me,
  expense,
}: {
  trip: Trip
  members: Member[]
  me: Member
  expense?: Expense
}) {
  const [draft, setDraft] = useState(() => initialDraft(trip, members, me.id, expense))
  const [errors, setErrors] = useState<ExpenseErrors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const path = `/t/${trip.share_token}`
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const fields = validateDraft(draft, members)
    setErrors(fields)
    setError('')
    if (Object.keys(fields).length) return
    setBusy(true)
    try {
      await saveExpense(expensePayload(trip.id, me.id, draft, expense))
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
  return (
    <form className="trip-stack" noValidate onSubmit={submit}>
      <h2>{expense ? '編輯支出' : '新增支出'}</h2>
      {params.get('source') === 'camera' && <Notice>拍收據功能即將推出，先手動新增。</Notice>}
      <TextField
        label="名稱"
        value={draft.title}
        error={errors.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
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
            {c.label}（{c.code}）
          </option>
        ))}
      </SelectField>
      <TextField
        label="日期"
        type="date"
        value={draft.spentOn}
        error={errors.spentOn}
        onChange={(e) => setDraft({ ...draft, spentOn: e.target.value })}
      />
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
      <Button variant="quiet" disabled={busy} onClick={() => navigate(path)}>
        取消
      </Button>
    </form>
  )
}
