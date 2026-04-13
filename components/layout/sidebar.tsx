'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CodeCamp, Task } from '@/types/database'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  Clock,
  AlertTriangle,
  Menu,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, differenceInDays, isToday, isTomorrow, isPast, parseISO } from 'date-fns'
import { taskCode } from '@/types/database'

const campStatusColor: Record<string, string> = {
  active:    'var(--primary)',
  paused:    '#eab308',
  completed: '#10b981',
  archived:  'var(--muted-foreground)',
}

type DeadlineTask = Pick<Task, 'id' | 'task_number' | 'title' | 'due_date' | 'priority' | 'assigned_to' | 'camp_id' | 'status'>

function relativeDue(due: string): { label: string; color: string } {
  const d = parseISO(due)
  if (isPast(d) && !isToday(d)) return { label: 'overdue', color: '#ff4444' }
  if (isToday(d))               return { label: 'today',   color: '#f97316' }
  if (isTomorrow(d))            return { label: 'tomorrow', color: '#eab308' }
  const days = differenceInDays(d, new Date())
  return { label: `${days}d`, color: days <= 3 ? '#eab308' : 'var(--muted-foreground)' }
}

export function Sidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()

  const [camps, setCamps]                 = useState<CodeCamp[]>([])
  const [campsOpen, setCampsOpen]         = useState(true)
  const [loggingOut, setLoggingOut]       = useState(false)
  const [syncing, setSyncing]             = useState(false)
  const [now, setNow]                     = useState<Date | null>(null)
  const [deadlineTasks, setDeadlineTasks] = useState<DeadlineTask[]>([])
  const [mobileOpen, setMobileOpen]       = useState(false)

  useEffect(() => {
    fetchCamps()
    fetchDeadlines()
    moveOverdueTasks()
  }, [])

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

  async function moveOverdueTasks() {
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('tasks')
      .update({ status: 'backlog' })
      .lt('due_date', today)
      .not('status', 'in', '("done","backlog")')
  }

  async function fetchDeadlines() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in7days = new Date(today)
    in7days.setDate(today.getDate() + 7)

    const { data } = await supabase
      .from('tasks')
      .select('id, task_number, title, due_date, priority, assigned_to, camp_id, status')
      .not('due_date', 'is', null)
      .lte('due_date', in7days.toISOString().split('T')[0])
      .neq('status', 'done')
      .order('due_date', { ascending: true })
      .limit(8)

    if (data) setDeadlineTasks(data as DeadlineTask[])
  }

  async function handleSync() {
    setSyncing(true)
    router.refresh()
    await Promise.all([fetchCamps(), fetchDeadlines()])
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
    <TooltipProvider delay={200}>

      {/* ── Mobile top bar (hamburger) ─────────────────────────────── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 flex items-center gap-3 px-4 shrink-0"
        style={{ background: 'var(--sidebar)', borderBottom: '1px solid var(--sidebar-border)' }}
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          style={{ background: 'var(--sidebar-accent)' }}
        >
          <Menu className="h-4 w-4" />
        </button>
        <div
          className="h-8 w-8 rounded-xl overflow-hidden shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--devcon-sky) 100%)' }}
        >
          <Image src="/icons/icon.png" alt="DEVCON 16" width={32} height={32} className="w-full h-full object-cover" />
        </div>
        <span className="font-bold text-sm text-foreground" style={{ fontFamily: 'var(--font-space-grotesk)' }}>Devie</span>
        <div className="ml-auto mono-tag">
          <span className="lime-dot" />
          <span>Live</span>
        </div>
      </div>

      {/* ── Mobile backdrop ───────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'flex flex-col w-64 h-screen shrink-0',
          'fixed md:sticky top-0 z-50 md:z-auto',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
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

          <div className="ml-auto flex items-center gap-2">
            <div className="mono-tag">
              <span className="lime-dot" />
              <span>Live</span>
            </div>
            {/* Close button — mobile only */}
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
                <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
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
                    <Link key={camp.id} href={`/dashboard/camps/${camp.id}`} onClick={() => setMobileOpen(false)}>
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

                <Link href="/dashboard/camps" onClick={() => setMobileOpen(false)}>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                    <Plus className="h-3.5 w-3.5" />
                    <span style={{ fontFamily: 'var(--font-space-grotesk)' }}>New Camp</span>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Bottom card: Manila Clock + Near Deadlines ─────────────── */}
        <div
          className="mx-3 mb-3 rounded-2xl px-4 py-3 shrink-0"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
        >
          {/* Clock header */}
          <div className="mono-tag mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
            <span className="lime-dot" />
            <span>Manila · PHT</span>
          </div>

          {/* Time */}
          <p
            className="text-2xl font-bold tabular-nums text-foreground leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            {manilaTime}
          </p>

          {/* Date */}
          <p
            className="mt-1.5 text-[10px] text-muted-foreground"
            style={{ fontFamily: 'var(--font-jetbrains-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
          >
            {manilaDate}
          </p>

          {/* ── Near Deadlines (replaces Q2 line) ──────────────────── */}
          <div
            className="mt-2.5 pt-2.5"
            style={{ borderTop: '1px solid var(--glass-border)' }}
          >
            {/* Deadlines header */}
            <div className="mono-tag mb-1.5" style={{ justifyContent: 'space-between', color: 'var(--muted-foreground)' }}>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                Near Deadlines
              </span>
              {deadlineTasks.length > 0 && (
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '9px' }}>
                  {deadlineTasks.length}
                </span>
              )}
            </div>

            {/* Task rows */}
            {deadlineTasks.length === 0 ? (
              <p
                className="text-[10px] text-muted-foreground/50 mb-1"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                No deadlines this week
              </p>
            ) : (
              <div className="space-y-0.5 mb-1">
                {deadlineTasks.map(task => {
                  const due = relativeDue(task.due_date!)
                  const href = task.camp_id
                    ? `/dashboard/camps/${task.camp_id}`
                    : '/dashboard/board'
                  const isOverdue = due.label === 'overdue'

                  return (
                    <Tooltip key={task.id}>
                      <TooltipTrigger
                        className="w-full text-left"
                        onClick={() => router.push(href)}
                      >
                        <div
                          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg cursor-pointer transition-all text-muted-foreground hover:text-foreground"
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.background = 'var(--sidebar-accent)'
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                          }}
                        >
                          {isOverdue && (
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" style={{ color: due.color }} />
                          )}
                          <span
                            className="truncate flex-1 text-[10px]"
                            style={{ fontFamily: 'var(--font-space-grotesk)' }}
                          >
                            {taskCode(task)} {task.title}
                          </span>
                          <span
                            className="shrink-0 text-[9px] font-semibold tabular-nums"
                            style={{ fontFamily: 'var(--font-jetbrains-mono)', color: due.color }}
                          >
                            {due.label}
                          </span>
                        </div>
                      </TooltipTrigger>

                      <TooltipContent side="right" sideOffset={8}>
                        <div className="space-y-1">
                          <p className="font-semibold text-xs leading-snug">{task.title}</p>
                          <p className="opacity-60 text-[10px]" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                            {taskCode(task)}
                          </p>
                          <div className="flex flex-col gap-0.5 pt-0.5">
                            <span className="text-[10px]" style={{ color: due.color }}>
                              📅 {task.due_date ? format(parseISO(task.due_date), 'MMM d, yyyy') : '—'}
                              {isOverdue ? ' · OVERDUE' : ''}
                            </span>
                            {task.assigned_to && (
                              <span className="text-[10px] opacity-70">👤 {task.assigned_to}</span>
                            )}
                            <span className="text-[10px] capitalize opacity-70">⚡ {task.priority}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-semibold transition-all disabled:opacity-40"
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
    </TooltipProvider>
  )
}
