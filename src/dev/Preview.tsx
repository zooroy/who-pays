import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import {
  AppShell,
  Avatar,
  AvatarChoice,
  AvatarRow,
  Button,
  CameraIcon,
  LinkIcon,
  Notice,
  PaidStamp,
  PencilIcon,
  SelectField,
  TextField,
  Ticket,
  TicketRow,
} from '../components'
import { AVATAR_IDS, type AvatarId } from '../lib/avatars'
import { formatMoney } from '../lib/money'
import './Preview.css'

const SWATCHES = [
  ['車票綠', '--color-ticket-green', '#E3EEE8'],
  ['票面白', '--color-ticket-paper', '#FAFCFB'],
  ['靛藍墨', '--color-ink', '#22385C'],
  ['次要墨', '--color-ink-soft', '#5A6B63'],
  ['朱肉紅', '--color-stamp', '#C8323C'],
  ['剪票灰', '--color-punch', '#9AA8A1'],
] as const

export default function Preview() {
  const [picked, setPicked] = useState<AvatarId>('cat')
  const [paidKey, setPaidKey] = useState(0)
  return (
    <MemoryRouter initialEntries={['/t/demo']}>
      <AppShell
        title="東京 2026"
        tripPath="/t/demo"
        headerExtra={
          <AvatarRow>
            <Avatar avatarId="bear" isMe label="小明" />
            <Avatar avatarId="cat" label="小華" />
            <Avatar avatarId="penguin" label="阿美" />
            <Avatar avatarId="fox" label="阿傑" />
          </AvatarRow>
        }
        thumbBar={
          <>
            <Button big icon={<CameraIcon />}>
              拍收據
            </Button>
            <Button variant="secondary" icon={<PencilIcon />}>
              手動新增
            </Button>
          </>
        }
      >
        <section className="preview-section">
          <h2>11月2日</h2>
          <div className="preview-stack">
            <Ticket onClick={() => {}} label="一蘭，¥3,240，熊付，4 人分">
              <TicketRow
                leading={<Avatar avatarId="bear" decorative />}
                title="一蘭 新宿中央東口店"
                meta="4 人分"
                amount={formatMoney(3240, 'JPY')}
              />
            </Ticket>
            <Ticket onClick={() => {}} label="計程車，¥3,000，貓付，全員分">
              <TicketRow
                leading={<Avatar avatarId="cat" decorative />}
                title="計程車"
                meta="全員分"
                amount={formatMoney(3000, 'JPY')}
              />
            </Ticket>
            <Ticket onClick={() => {}} label="機票，NT$12,000，狐狸付">
              <TicketRow
                leading={<Avatar avatarId="fox" decorative />}
                title="來回機票"
                meta="4 人分"
                amount={formatMoney(12000, 'TWD')}
              />
            </Ticket>
          </div>
        </section>

        <section className="preview-section">
          <h2>轉帳票（有票根）</h2>
          <Ticket
            stub={
              paidKey === 0 ? (
                <Button variant="secondary" onClick={() => setPaidKey(1)}>
                  標記已付
                </Button>
              ) : (
                <span className="preview-paid">
                  <PaidStamp key={paidKey} date="11/03" animate />
                  <Button variant="quiet" onClick={() => setPaidKey((k) => k + 1)}>
                    再蓋一次
                  </Button>
                </span>
              )
            }
          >
            <TicketRow
              leading={
                <span className="preview-transfer">
                  <Avatar avatarId="cat" size="small" decorative /> →{' '}
                  <Avatar avatarId="bear" size="small" decorative />
                </span>
              }
              title="貓 付給 熊"
              amount={formatMoney(4200, 'JPY')}
            />
          </Ticket>
        </section>

        <section className="preview-section">
          <h2>提示</h2>
          <div className="preview-stack">
            <Notice>品項加總與總額差 ¥120，請確認金額。</Notice>
            <Notice tone="problem" action={<Button variant="quiet">手動輸入</Button>}>
              今天的自動辨識額度已用完，請手動輸入。
            </Notice>
          </div>
        </section>

        <section className="preview-section">
          <h2>表單</h2>
          <div className="preview-stack">
            <TextField label="名稱" defaultValue="計程車" />
            <TextField label="金額" inputMode="numeric" defaultValue="0" error="金額必須大於 0" />
            <SelectField label="幣別" defaultValue="JPY">
              <option value="JPY">日圓 ¥</option>
              <option value="TWD">新台幣 NT$</option>
            </SelectField>
            <Button icon={<LinkIcon />} variant="secondary">
              複製旅程連結
            </Button>
            <Button disabled>儲存支出</Button>
          </div>
        </section>

        <section className="preview-section">
          <h2>選一個角色</h2>
          <div className="preview-avatars">
            {AVATAR_IDS.map((id) => (
              <AvatarChoice
                key={id}
                avatarId={id}
                selected={picked === id}
                taken={id === 'bear' || id === 'penguin'}
                onSelect={setPicked}
              />
            ))}
          </div>
        </section>

        <section className="preview-section">
          <h2>色票</h2>
          <div className="preview-swatches">
            {SWATCHES.map(([name, token, hex]) => (
              <div key={token} className="preview-swatch">
                <span className="preview-swatch__chip" style={{ background: `var(${token})` }} />
                <span>{name}</span>
                <span className="text-soft amount">{hex}</span>
              </div>
            ))}
          </div>
          <p className="preview-type-display amount">{formatMoney(128400, 'JPY')}</p>
          <p>字體：jf open 粉圓。生ビール、ラーメン、餃子也能顯示。</p>
        </section>
      </AppShell>
    </MemoryRouter>
  )
}
