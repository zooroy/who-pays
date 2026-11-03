import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell, Button, Notice } from './components'
import { ensureSession } from './lib/supabase'
import { CreateTrip } from './features/trip/CreateTrip'
import { TripPage } from './features/trip/TripPage'
import './features/trip/trip.css'

const queryClient = new QueryClient()
function AuthenticatedApp() {
  const session = useQuery({ queryKey: ['session'], queryFn: async () => { await ensureSession(); return true }, staleTime: Infinity, retry: false })
  if (session.isPending) return <main><p role="status">載入中…</p></main>
  if (session.isError) return <AppShell title="誰付錢"><Notice tone="problem" action={<Button onClick={() => void session.refetch()}>重新連線</Button>}>無法連線，請確認網路後再試一次。</Notice></AppShell>
  return <Routes><Route path="/" element={<CreateTrip />} /><Route path="/t/:shareToken" element={<TripPage />} /><Route path="/t/:shareToken/settle" element={<TripPage />} /><Route path="*" element={<AppShell title="找不到頁面"><a href="/">建立新旅程</a></AppShell>} /></Routes>
}
export default function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><AuthenticatedApp /></BrowserRouter></QueryClientProvider>
}
