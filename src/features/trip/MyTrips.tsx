import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { readIdentity } from '../../lib/identity'
import { CURRENCIES } from '../../lib/money'
import { CreateTripForm } from './CreateTrip'
import { getMyTrips, type MyTrip } from './api'
import { parseShareToken } from './shareLink'

/** 我的旅程: the home screen (polish-after-first-trip design §1–3). */
export function MyTrips() {
  const navigate = useNavigate()
  const trips = useQuery({ queryKey: ['my-trips'], queryFn: getMyTrips })
  if (trips.isPending)
    return (
      <AppShell title="我的旅程">
        <p role="status">載入中…</p>
      </AppShell>
    )
  if (trips.isError)
    return (
      <AppShell title="我的旅程">
        <Notice
          tone="problem"
          action={<Button onClick={() => void trips.refetch()}>重新載入</Button>}
        >
          無法載入旅程，請確認網路後再試一次。
        </Notice>
      </AppShell>
    )
  if (trips.data.length === 0)
    return (
      <AppShell title="建立旅程">
        <div className="trip-stack">
          <CreateTripForm />
          <OpenTripLink />
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
        <Button variant="secondary" icon={<PlusIcon />} onClick={() => navigate('/new')}>
          建立新旅程
        </Button>
        <OpenTripLink />
      </div>
    </AppShell>
  )
}

function TripTicket({ trip, onOpen }: { trip: MyTrip; onOpen: () => void }) {
  const myId = readIdentity(trip.id)
  const me = trip.members.find((m) => m.id === myId)
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
function OpenTripLink() {
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
    <section className="trip-stack my-trips__open" aria-labelledby="open-trip-heading">
      <h2 id="open-trip-heading">用旅程連結開啟</h2>
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
    </section>
  )
}
