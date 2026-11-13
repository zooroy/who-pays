import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router'
import {
  AppShell,
  Avatar,
  AvatarRow,
  Button,
  CameraIcon,
  PencilIcon,
  Ticket,
  Notice,
} from '../../components'
import { deleteMemberError, hasErrorCode, membershipError } from '../../lib/identity'
import { useAccount } from '../account/account'
import {
  addMember,
  deleteMember,
  deleteTrip,
  getMembers,
  getMyMember,
  getTrip,
  joinTrip,
  meKey,
  resetShareToken,
  setMyMember,
  tripKey,
  updateMember,
  type Member,
  type Trip,
} from './api'
import { MemberForm } from './MemberForm'
import { useTripRealtime } from './useTripRealtime'
import { shareUrl } from './shareLink'
import { getExpenses } from '../expense/api'
import { ExpenseList } from '../expense/ExpenseList'
import { ExpenseForm } from '../expense/ExpenseForm'
import { ExpenseDetail } from '../expense/ExpenseDetail'
import { SettlePage } from '../settlement/SettlePage'
import { ReceiptScan } from '../receipt/ReceiptScan'
import { PhotoInput } from '../receipt/PhotoInput'
import { setPendingPhoto } from '../receipt/pending'
import type { Expense } from '../expense/model'

const HOME = { to: '/', label: '回到我的旅程' }

export function TripPage() {
  const { shareToken = '' } = useParams()
  const navigate = useNavigate()
  const joined = useQuery({
    queryKey: ['join-trip', shareToken],
    queryFn: () => joinTrip(shareToken),
    staleTime: Infinity,
    retry: false,
  })
  if (joined.isPending)
    return (
      <AppShell title="旅程" back={HOME}>
        <p role="status">載入中…</p>
      </AppShell>
    )
  if (!joined.data)
    return (
      <AppShell title="旅程" back={HOME}>
        <div className="trip-stack">
          <Notice tone="problem">{membershipError(joined.error)}</Notice>
          {!hasErrorCode(joined.error, 'TRIP_NOT_FOUND') && (
            <Button onClick={() => void joined.refetch()}>重新載入</Button>
          )}
          <Button onClick={() => navigate('/')}>回到我的旅程</Button>
        </div>
      </AppShell>
    )
  return <TripData key={joined.data} tripId={joined.data} />
}
function TripData({ tripId }: { tripId: string }) {
  const navigate = useNavigate()
  useTripRealtime(tripId)
  const expenses = useQuery({
    queryKey: [...tripKey(tripId), 'expenses'],
    queryFn: () => getExpenses(tripId),
  })
  const trip = useQuery({
    queryKey: [...tripKey(tripId), 'details'],
    queryFn: () => getTrip(tripId),
  })
  const members = useQuery({
    queryKey: [...tripKey(tripId), 'members'],
    queryFn: () => getMembers(tripId),
  })
  const me = useQuery({ queryKey: meKey(tripId), queryFn: () => getMyMember(tripId) })
  if (trip.isPending || members.isPending || expenses.isPending || me.isPending)
    return (
      <AppShell title="旅程" back={HOME}>
        <p role="status">載入中…</p>
      </AppShell>
    )
  // The row is gone: the owner deleted the trip while it was open.
  if (trip.error && 'code' in trip.error && trip.error.code === 'PGRST116')
    return (
      <AppShell title="旅程" back={HOME}>
        <div className="trip-stack">
          <Notice tone="problem">找不到這趟旅程，可能已被擁有者刪除。</Notice>
          <Button onClick={() => navigate('/')}>回到我的旅程</Button>
        </div>
      </AppShell>
    )
  if (!trip.data || !members.data || !expenses.data || me.data === undefined)
    return (
      <AppShell title="旅程" back={HOME}>
        <Notice
          tone="problem"
          action={
            <Button
              onClick={() => {
                void trip.refetch()
                void members.refetch()
                void expenses.refetch()
                void me.refetch()
              }}
            >
              重新載入
            </Button>
          }
        >
          無法讀取旅程，請再試一次。
        </Notice>
      </AppShell>
    )
  return (
    <TripContent
      trip={trip.data}
      members={members.data}
      expenses={expenses.data}
      memberId={me.data}
    />
  )
}
function TripContent({
  trip,
  members,
  expenses,
  memberId,
}: {
  trip: Trip
  members: Member[]
  expenses: Expense[]
  memberId: string | null
}) {
  const navigate = useNavigate()
  const { expenseId, shareToken } = useParams()
  const queryClient = useQueryClient()
  const location = useLocation()
  const account = useAccount()
  const isOwner = account.data?.isOwner === true
  const [panel, setPanel] = useState<
    'members' | 'add' | 'switch' | 'settings' | { edit: string } | null
  >(null)
  // Leaving a page closes the member panel, so it never hides the screen you navigate to.
  // Compared without the share token, so following a reset link keeps the panel open.
  const subPath = location.pathname.slice(`/t/${shareToken ?? ''}`.length)
  const [panelPath, setPanelPath] = useState(subPath)
  if (panelPath !== subPath) {
    setPanelPath(subPath)
    setPanel(null)
  }
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const me = members.find((m) => m.id === memberId)
  const path = `/t/${trip.share_token}`
  const isNew = location.pathname === `${path}/expenses/new`
  const isEdit = location.pathname.endsWith('/edit')
  const isCamera = isNew && new URLSearchParams(location.search).get('source') === 'camera'
  const selected = expenses.find((e) => e.id === expenseId)
  const isList = location.pathname === path
  const refresh = () => queryClient.invalidateQueries({ queryKey: tripKey(trip.id) })
  // The owner reset the share link while this page was open: follow the new link.
  useEffect(() => {
    if (!shareToken || shareToken === trip.share_token) return
    // Already has access: skip join_trip so the page stays mounted.
    queryClient.setQueryData(['join-trip', trip.share_token], trip.id)
    navigate(location.pathname.replace(`/t/${shareToken}`, path) + location.search, {
      replace: true,
    })
  }, [
    shareToken,
    trip.share_token,
    trip.id,
    path,
    location.pathname,
    location.search,
    navigate,
    queryClient,
  ])
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(window.location.origin, trip.share_token))
      setCopied(true)
      setError('')
    } catch {
      setError('無法複製連結，請再試一次。')
    }
  }
  async function claim(id: string) {
    try {
      await setMyMember(trip.id, id)
      queryClient.setQueryData(meKey(trip.id), id)
      setPanel(null)
      setError('')
    } catch {
      setError('無法記住身份，請確認網路連線後再試一次。')
    }
  }
  if (!me)
    return (
      <AppShell title={trip.name} back={HOME}>
        <div className="trip-stack">
          <h2>加入旅程</h2>
          {members.length >= 16 ? (
            <Notice>這趟旅程已經有 16 人，請從下面選擇你是誰。</Notice>
          ) : (
            <MemberForm
              members={members}
              label="加入旅程"
              onRefresh={refresh}
              onSave={async (name, avatar) => {
                const id = await addMember(trip.id, name, avatar)
                await refresh()
                await claim(id)
              }}
            />
          )}
          <h2>我是……</h2>
          {error && <Notice tone="problem">{error}</Notice>}
          <ul className="trip-members">
            {members.map((m) => (
              <li key={m.id}>
                <Button
                  variant="secondary"
                  onClick={() => void claim(m.id)}
                  icon={<Avatar avatarId={m.avatar_id} decorative />}
                >
                  {m.name}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </AppShell>
    )
  return (
    <AppShell
      title={trip.name}
      back={HOME}
      tripPath={path}
      thumbBar={
        isList && (
          <>
            <PhotoInput
              onPick={(file) => {
                setPendingPhoto(file)
                navigate(`${path}/expenses/new?source=camera`)
              }}
            >
              {(open) => (
                <Button big icon={<CameraIcon />} onClick={open}>
                  拍收據
                </Button>
              )}
            </PhotoInput>
            <Button
              variant="secondary"
              icon={<PencilIcon />}
              onClick={() => navigate(`${path}/expenses/new`)}
            >
              手動新增
            </Button>
          </>
        )
      }
      headerExtra={
        <button
          className="trip-header-members"
          type="button"
          aria-label="檢視成員列表"
          aria-expanded={panel === 'members'}
          onClick={() => setPanel(panel === 'members' ? null : 'members')}
        >
          <AvatarRow>
            {members.map((m) => (
              <Avatar
                key={m.id}
                avatarId={m.avatar_id}
                size="small"
                label={m.name}
                isMe={m.id === me.id}
              />
            ))}
          </AvatarRow>
        </button>
      }
    >
      <div className="trip-stack">
        {error && <Notice tone="problem">{error}</Notice>}
        {panel === 'members' ? (
          <section className="trip-stack" aria-labelledby="trip-members-title">
            <h2 id="trip-members-title">成員（{members.length} 人）</h2>
            <ul className="trip-members">
              {members.map((m) => (
                <li key={m.id} className="trip-member">
                  <Avatar avatarId={m.avatar_id} isMe={m.id === me.id} decorative />
                  <span className="trip-member__name">
                    {m.name}
                    {m.id === me.id ? '（你）' : ''}
                  </span>
                  <Button variant="quiet" onClick={() => setPanel({ edit: m.id })}>
                    編輯<span className="visually-hidden">{m.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="trip-actions">
              <Button variant="secondary" onClick={() => void copyLink()}>
                {copied ? '已複製連結' : '複製旅程連結'}
              </Button>
              <Button variant="secondary" onClick={() => setPanel('add')}>
                新增朋友
              </Button>
            </div>
            <p className="trip-hint">
              朋友打開旅程連結就能自己加入，不用登入；沒有手機的朋友可以由你代為新增。
            </p>
            <div className="trip-actions">
              <Button variant="quiet" onClick={() => setPanel('switch')}>
                切換身份
              </Button>
              {isOwner && (
                <Button variant="quiet" onClick={() => setPanel('settings')}>
                  旅程設定
                </Button>
              )}
              <Button variant="quiet" onClick={() => setPanel(null)}>
                關閉
              </Button>
            </div>
          </section>
        ) : panel === 'switch' ? (
          <section className="trip-stack" aria-labelledby="trip-switch-title">
            <h2 id="trip-switch-title">切換身份</h2>
            <p className="trip-hint">選擇你在這趟旅程中是誰。</p>
            {error && <Notice tone="problem">{error}</Notice>}
            <ul className="trip-members">
              {members.map((m) => (
                <li key={m.id}>
                  <Button
                    variant="secondary"
                    disabled={m.id === me.id}
                    onClick={() => void claim(m.id)}
                    icon={<Avatar avatarId={m.avatar_id} decorative />}
                  >
                    {m.name}
                    {m.id === me.id ? '（目前）' : ''}
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="quiet" onClick={() => setPanel('members')}>
              取消
            </Button>
          </section>
        ) : panel === 'settings' && isOwner ? (
          <TripSettings
            trip={trip}
            copied={copied}
            onCopy={() => void copyLink()}
            onDone={() => setPanel('members')}
          />
        ) : typeof panel === 'object' && panel !== null ? (
          <EditMember
            key={panel.edit}
            member={members.find((m) => m.id === panel.edit)}
            members={members}
            onRefresh={refresh}
            onDone={() => setPanel('members')}
          />
        ) : panel === 'add' ? (
          <section className="trip-stack" aria-labelledby="trip-add-title">
            <h2 id="trip-add-title">新增朋友</h2>
            {members.length >= 16 ? (
              <Notice>這趟旅程已經有 16 人，無法再新增朋友。</Notice>
            ) : (
              <MemberForm
                members={members}
                label="新增朋友"
                onRefresh={refresh}
                onSave={async (name, avatar) => {
                  await addMember(trip.id, name, avatar)
                  await refresh()
                  setPanel('members')
                }}
              />
            )}
            <Button variant="quiet" onClick={() => setPanel('members')}>
              取消
            </Button>
          </section>
        ) : isNew ? (
          isCamera ? (
            <ReceiptScan key={`scan:${me.id}`} trip={trip} members={members} me={me} />
          ) : (
            <ExpenseForm key={`new:${me.id}`} trip={trip} members={members} me={me} />
          )
        ) : expenseId ? (
          selected ? (
            isEdit ? (
              <ExpenseForm
                key={`${selected.id}:${me.id}`}
                trip={trip}
                members={members}
                me={me}
                expense={selected}
              />
            ) : (
              <ExpenseDetail
                key={selected.id}
                expense={selected}
                members={members}
                tripId={trip.id}
                path={path}
              />
            )
          ) : (
            <Notice action={<Button onClick={() => navigate(path)}>回到列表</Button>}>
              這筆支出已被刪除。
            </Notice>
          )
        ) : isList ? (
          <>
            {members.length === 1 && (
              <Ticket>
                <div className="trip-invite">
                  <p>把旅程連結傳給朋友，他們打開後選個頭像就能加入。</p>
                  <Button variant="secondary" onClick={() => void copyLink()}>
                    {copied ? '已複製連結' : '複製旅程連結'}
                  </Button>
                </div>
              </Ticket>
            )}
            <ExpenseList expenses={expenses} members={members} path={path} />
          </>
        ) : (
          <SettlePage trip={trip} members={members} expenses={expenses} me={me} />
        )}
      </div>
    </AppShell>
  )
}

function EditMember({
  member,
  members,
  onRefresh,
  onDone,
}: {
  member: Member | undefined
  members: Member[]
  onRefresh: () => Promise<unknown>
  onDone: () => void
}) {
  return (
    <section className="trip-stack" aria-labelledby="trip-edit-title">
      <h2 id="trip-edit-title">編輯成員</h2>
      {member ? (
        <MemberForm
          members={members}
          initial={member}
          label="儲存成員"
          onRefresh={onRefresh}
          onSave={async (name, avatar) => {
            await updateMember(member.id, name, avatar)
            await onRefresh()
            onDone()
          }}
        />
      ) : (
        <Notice>找不到這位成員，可能已被其他人修改。</Notice>
      )}
      {member && <DeleteMember member={member} onRefresh={onRefresh} onDone={onDone} />}
      <Button variant="quiet" onClick={onDone}>
        取消
      </Button>
    </section>
  )
}

/** Only members without any expense or settlement can go (spec「刪除成員」). */
function DeleteMember({
  member,
  onRefresh,
  onDone,
}: {
  member: Member
  onRefresh: () => Promise<unknown>
  onDone: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteMember(member.id)
      await onRefresh()
      onDone()
    } catch (err) {
      setError(deleteMemberError(err, member.name))
      setConfirm(false)
      setBusy(false)
    }
  }
  return (
    <div className="trip-stack trip-danger">
      {error && <Notice tone="problem">{error}</Notice>}
      {confirm ? (
        <section className="trip-stack" aria-label={`確認刪除${member.name}`}>
          <p>確定要把{member.name}從旅程中刪除嗎？</p>
          <div className="trip-actions">
            <Button busy={busy} onClick={() => void remove()}>
              刪除{member.name}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(false)}>
              取消
            </Button>
          </div>
        </section>
      ) : (
        <Button variant="quiet" onClick={() => setConfirm(true)}>
          刪除成員
        </Button>
      )}
    </div>
  )
}

/** Owner only: reset the share link or delete the trip (owner-account spec). */
function TripSettings({
  trip,
  copied,
  onCopy,
  onDone,
}: {
  trip: Trip
  copied: boolean
  onCopy: () => void
  onDone: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function reset() {
    setBusy(true)
    setError('')
    try {
      await resetShareToken(trip.id)
      // No automatic copy: after a network round trip browsers (iOS Safari) no longer
      // treat it as a tap, so copying is a separate button press.
      setNotice('已重設分享連結。舊連結不能再用來加入，請複製新連結傳給朋友。')
      setConfirm(null)
      // The page follows the new token once the trip refetches.
      await queryClient.invalidateQueries({ queryKey: tripKey(trip.id) })
    } catch (err) {
      setError(membershipError(err))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true)
    setError('')
    try {
      await deleteTrip(trip.id)
      queryClient.removeQueries({ queryKey: tripKey(trip.id) })
      await queryClient.invalidateQueries({ queryKey: ['my-trips'] })
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        hasErrorCode(err, 'OWNER_REQUIRED')
          ? membershipError(err)
          : '無法刪除旅程，請確認網路連線後再試一次。',
      )
      setBusy(false)
    }
  }
  return (
    <section className="trip-stack" aria-labelledby="trip-settings-title">
      <h2 id="trip-settings-title">旅程設定</h2>
      {error && <Notice tone="problem">{error}</Notice>}
      {notice && (
        <Notice
          action={
            <Button variant="secondary" onClick={onCopy}>
              {copied ? '已複製新連結' : '複製新連結'}
            </Button>
          }
        >
          {notice}
        </Notice>
      )}
      {confirm === 'reset' ? (
        <section className="trip-stack" aria-label="確認重設分享連結">
          <p>重設後，舊的連結就不能再用來加入。已經加入的朋友不受影響。</p>
          <div className="trip-actions">
            <Button busy={busy} onClick={() => void reset()}>
              重設分享連結
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
              取消
            </Button>
          </div>
        </section>
      ) : confirm === 'delete' ? (
        <section className="trip-stack" aria-label="確認刪除旅程">
          <p>
            刪除「{trip.name}
            」會一起刪除所有支出、還款、成員與收據照片，所有人都無法再開啟，而且無法復原。
          </p>
          <div className="trip-actions">
            <Button busy={busy} onClick={() => void remove()}>
              刪除旅程
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
              取消
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div className="trip-stack">
            <p className="trip-hint">連結被轉傳給不該加入的人時，可以重設分享連結。</p>
            <Button variant="secondary" onClick={() => setConfirm('reset')}>
              重設分享連結
            </Button>
          </div>
          <div className="trip-stack trip-danger">
            <Button variant="secondary" onClick={() => setConfirm('delete')}>
              刪除旅程
            </Button>
          </div>
        </>
      )}
      <Button variant="quiet" disabled={busy} onClick={onDone}>
        返回成員
      </Button>
    </section>
  )
}
