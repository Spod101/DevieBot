'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CodeCamp } from '@/types/database'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard,
  KanbanSquare,
  Tent,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

const campStatusColor: Record<string, string> = {
  active:    'var(--primary)',
  paused:    '#eab308',
  completed: '#10b981',
  archived:  'var(--muted-foreground)',
}

export function Sidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()

  const [camps, setCamps]           = useState<CodeCamp[]>([])
  const [campsOpen, setCampsOpen]   = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [now, setNow]               = useState<Date | null>(null)

  useEffect(() => { fetchCamps() }, [])

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const manilaTime = now
    ? now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--'

  const manilaDate = now
    ? now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' })
    : '---'

  const q2Deadline = now
    ? (() => {
        const d = new Date(now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }))
        return new Date(d.getFullYear(), 5, 30).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      })()
    : 'Jun 30'

  async function handleSync() {
    setSyncing(true)
    router.refresh()
    await fetchCamps()
    setSyncing(false)
  }

  async function fetchCamps() {
    const { data } = await supabase
      .from('code_camps')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setCamps(data)
  }

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/auth/login')
    router.refresh()
  }

  const navItems = [
    { href: '/dashboard',          label: 'Overview',      icon: LayoutDashboard },
    { href: '/dashboard/board',    label: 'General Board', icon: KanbanSquare },
    { href: '/dashboard/camps',    label: 'Code Camps',    icon: Tent },
    { href: '/dashboard/team',     label: 'Team',          icon: Users },
    { href: '/dashboard/settings', label: 'Settings',      icon: Settings },
  ]

  return (
    <aside
      className="flex flex-col w-64 h-screen sticky top-0 shrink-0"
      style={{
        background: 'var(--sidebar)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* ── Logo / Header ─────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 h-16 shrink-0"
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        {/* DEVCON 16 logo — icon.png with screen blend so black bg vanishes in dark */}
        <div
          className="h-10 w-10 rounded-xl overflow-hidden shrink-0 relative"
          style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--devcon-sky) 100%)',
            boxShadow: '0 0 14px color-mix(in srgb, var(--primary) 35%, transparent)',
          }}
        >
          <Image
            src="/icons/icon.png"
            alt="DEVCON 16"
            width={40}
            height={40}
            className="w-full h-full object-cover"
            style={{ mixBlendMode: 'screen', opacity: 0.92 }}
          />
        </div>

        <div className="flex flex-col leading-none">
          <span
            className="font-bold tracking-tight text-sm text-foreground"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Devie
          </span>
          <span
            className="text-[9px] font-semibold"
            style={{ fontFamily: 'var(--font-jetbrains-mono)', color: 'var(--devcon-sky)', letterSpacing: '0.15em' }}
          >
            DEVCON 16
          </span>
        </div>

        {/* System status */}
        <div className="ml-auto mono-tag">
          <span className="lime-dot" />
          <span>Live</span>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────── */}
      <ScrollArea className="flex-1 py-4 styled-scroll">
        <nav className="px-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer',
                    active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                  style={active ? {
                    background: 'var(--sidebar-primary)',
                    boxShadow: '0 0 20px color-mix(in srgb, var(--sidebar-primary) 25%, transparent)',
                  } : { background: 'transparent' }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--sidebar-accent)'
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span style={{ fontFamily: 'var(--font-space-grotesk)' }}>{label}</span>
                  {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground/40" />}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* ── Code Camps ────────────────────────── */}
        <div className="px-3 mt-6">
          <button
            onClick={() => setCampsOpen(v => !v)}
            className="mono-tag w-full px-3 py-2 hover:text-foreground transition-colors"
            style={{ justifyContent: 'space-between' }}
          >
            <span>Code Camps</span>
            {campsOpen
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
            }
          </button>

          {campsOpen && (
            <div className="mt-1 space-y-0.5">
              {camps.map(camp => {
                const active = pathname === `/dashboard/camps/${camp.id}`
                const dot    = campStatusColor[camp.status] ?? 'var(--muted-foreground)'
                return (
                  <Link key={camp.id} href={`/dashboard/camps/${camp.id}`}>
                    <div
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs cursor-pointer transition-all',
                        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                      style={{
                        background: active ? 'var(--sidebar-accent)' : 'transparent',
                        border:     active ? '1px solid var(--sidebar-border)' : '1px solid transparent',
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dot }} />
                      <span className="truncate" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                        {camp.name}
                      </span>
                      <span
                        className="ml-auto shrink-0 text-muted-foreground/60"
                        style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '10px' }}
                      >
                        {camp.progress}%
                      </span>
                    </div>
                  </Link>
                )
              })}

              <Link href="/dashboard/camps">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                  <span style={{ fontFamily: 'var(--font-space-grotesk)' }}>New Camp</span>
                </div>
              </Link>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Manila Clock ──────────────────────────── */}
      <div
        className="mx-3 mb-3 rounded-2xl px-4 py-3"
        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
      >
        <div className="mono-tag mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
          <span className="lime-dot" />
          <span>Manila · PHT</span>
        </div>

        <p
          className="text-2xl font-bold tabular-nums text-foreground leading-none tracking-tight"
          style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
        >
          {manilaTime}
        </p>

        <p
          className="mt-1.5 text-[10px] text-muted-foreground"
          style={{ fontFamily: 'var(--font-jetbrains-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
        >
          {manilaDate}
        </p>

        <p
          className="text-[10px] font-semibold"
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--devcon-orange)',
          }}
        >
          Q2 ends {q2Deadline}
        </p>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-semibold transition-all disabled:opacity-40"
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            color: 'var(--muted-foreground)',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--devcon-sky) 10%, transparent)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--devcon-sky) 30%, transparent)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--devcon-sky)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--glass-bg)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--glass-border)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)'
          }}
        >
          <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
          Sync
        </button>
      </div>

      {/* ── Sign out ──────────────────────────────── */}
      <div
        className="px-3 pb-4 shrink-0"
        style={{ borderTop: '1px solid var(--sidebar-border)', paddingTop: '12px' }}
      >
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-destructive transition-all disabled:opacity-50"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          }}
        >
          {loggingOut
            ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            : <LogOut className="h-4 w-4 shrink-0" />
          }
          Sign out
        </button>
      </div>
    </aside>
  )
}
