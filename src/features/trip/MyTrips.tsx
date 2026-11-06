import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  AppShell,
  Avatar,
  Button,
  LinkIcon,
  Notice,
  PlusIcon,
  TextField,
  Ticket,
  TicketRow,
} from '../../components'
import { CURRENCIES } from '../../lib/money'
import { signOut, useAccount } from '../account/account'
import { CreateTripForm } from './CreateTrip'
import { getMyTrips, type MyTrip } from './api'
import { parseShareToken } from './shareLink'

/**
 * 我的旅程 (owner-account design §9): the owner sees every trip and can create one;
 * friends see the trips they joined, a folded 用旅程連結開啟 and 擁有者登入.
 */
export function MyTrips() {
  const navigate = useNavigate()
  const account = useAccount()
  const trips = useQuery({ queryKey: ['my-trips'], queryFn: getMyTrips })
  if (account.isPending || trips.isPending)
    return (
      <AppShell title="我的旅程">
        <p role="status">載入中…</p>
      </AppShell>
    )
  if (account.isError || trips.isError)
    return (
      <AppShell title="我的旅程">
        <Notice
          tone="problem"
          action={
            <Button
              onClick={() => {
                void account.refetch()
                void trips.refetch()
              }}
            >
              重新載入
            </Button>
          }
        >
          無法載入旅程，請確認網路後再試一次。
        </Notice>
      </AppShell>
    )
  const { isOwner, signedIn } = account.data
  if (isOwner && trips.data.length === 0)
    return (
      <AppShell title="建立旅程">
        <div className="trip-stack">
          <CreateTripForm />
          <AccountAction signedIn />
        </div>
      </AppShell>
    )
  if (!isOwner && trips.data.length === 0)
    return (
      <AppShell title="誰付錢">
        <div className="trip-stack">
          <Notice>還沒有旅程。請向朋友索取旅程連結，點開就能加入。</Notice>
          <OpenTripLink open />
          <AccountAction signedIn={signedIn} />
        </div>
      </AppShell>
    )
  return (
    <AppShell title="我的旅程">
      <div className="trip-stack">
        <ul className="my-trips">
          {trips.data.map((trip) => (
            <li key={trip.id}>
              <TripTicket trip={trip} onOpen={() => navigate(`/t/${trip.share_token}`)} />
            </li>
          ))}
        </ul>
        {isOwner ? (
          <Button variant="secondary" icon={<PlusIcon />} onClick={() => navigate('/new')}>
            建立新旅程
          </Button>
        ) : (
          <OpenTripLink />
        )}
        <AccountAction signedIn={signedIn} />
      </div>
    </AppShell>
  )
}

/** 擁有者登入 for friends, 登出 once signed in. Quiet: most people never need it. */
function AccountAction({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!signedIn)
    return (
      <div className="my-trips__account">
        <Button variant="quiet" onClick={() => navigate('/login')}>
          擁有者登入
        </Button>
      </div>
    )
  async function logOut() {
    setBusy(true)
    setError('')
    try {
      await signOut()
      await queryClient.resetQueries()
    } catch {
      setError('無法登出，請確認網路後再試一次。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="my-trips__account">
      {error && <Notice tone="problem">{error}</Notice>}
      <Button variant="quiet" busy={busy} onClick={() => void logOut()}>
        登出
      </Button>
    </div>
  )
}

function TripTicket({ trip, onOpen }: { trip: MyTrip; onOpen: () => void }) {
  const me = trip.members.find((m) => m.id === trip.my_member_id)
  return (
    <Ticket onClick={onOpen} label={`開啟${trip.name}`}>
      <TicketRow
        leading={me ? <Avatar avatarId={me.avatar_id} decorative /> : undefined}
        title={trip.name}
        meta={`${trip.members.length} 位成員`}
        amount={CURRENCIES[trip.default_currency].label}
      />
    </Ticket>
  )
}

/** Brings an existing trip into this browser or home screen app (design §3). */
function OpenTripLink({ open: startOpen = false }: { open?: boolean }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const canPaste = typeof navigator.clipboard?.readText === 'function'
  function open(value: string) {
    const token = parseShareToken(value)
    if (!token) {
      setError('這不是有效的旅程連結，請貼上朋友分享的完整連結。')
      return
    }
    navigate(`/t/${token}`)
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    open(text)
  }
  async function paste() {
    try {
      const value = await navigator.clipboard.readText()
      setText(value)
      setError('')
      open(value)
    } catch {
      // Denied or unsupported: typing or pasting by hand still works.
    }
  }
  return (
    <details className="my-trips__open" open={startOpen}>
      <summary>用旅程連結開啟</summary>
      <div className="trip-stack">
        <p className="trip-hint">
          在其他瀏覽器或主畫面 App 第一次使用時，貼上旅程連結，再選「我是……」就能接回原本的身份。
        </p>
        <form className="trip-stack my-trips__form" onSubmit={submit} noValidate>
          <TextField
            label="旅程連結"
            value={text}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            error={error || undefined}
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
          />
          <div className="trip-actions">
            <Button type="submit" variant="secondary">
              開啟旅程
            </Button>
            {canPaste && (
              <Button variant="quiet" icon={<LinkIcon />} onClick={() => void paste()}>
                貼上剪貼簿的連結
              </Button>
            )}
          </div>
        </form>
      </div>
    </details>
  )
}
