'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CodeCamp } from '@/types/database'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
} from 'lucide-react'
import { toast } from 'sonner'

const campStatusColor: Record<string, string> = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  completed: 'bg-blue-500',
  archived: 'bg-gray-500',
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [camps, setCamps] = useState<CodeCamp[]>([])
  const [campsOpen, setCampsOpen] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    fetchCamps()
  }, [])

  // Manila clock — start after mount to avoid hydration mismatch
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const manilaTime = now
    ? now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--'

  const manilaDate = now
    ? now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : ''

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
    { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
    { href: '/dashboard/board', label: 'General Board', icon: KanbanSquare },
    { href: '/dashboard/camps', label: 'Code Camps', icon: Tent },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <aside className="flex flex-col w-64 min-h-screen border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-16 border-b">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <LayoutDashboard className="h-5 w-5 text-primary" />
        </div>
        <span className="font-bold text-lg tracking-tight">Devie</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">Admin</Badge>
      </div>

      <ScrollArea className="flex-1 py-3">
        <nav className="px-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
            return (
              <Link key={href} href={href}>
                <div className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </div>
              </Link>
            )
          })}
        </nav>

        <Separator className="my-3 mx-3" />

        {/* Code Camps section */}
        <div className="px-3">
          <button
            onClick={() => setCampsOpen(v => !v)}
            className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <span>Code Camps</span>
            {campsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>

          {campsOpen && (
            <div className="mt-1 space-y-0.5">
              {camps.map(camp => {
                const active = pathname === `/dashboard/camps/${camp.id}`
                return (
                  <Link key={camp.id} href={`/dashboard/camps/${camp.id}`}>
                    <div className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}>
                      <span className={cn('h-2 w-2 rounded-full shrink-0', campStatusColor[camp.status])} />
                      <span className="truncate">{camp.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{camp.progress}%</span>
                    </div>
                  </Link>
                )
              })}

              <Link href="/dashboard/camps">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer">
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Camp</span>
                </div>
              </Link>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Manila Clock Widget */}
      <div className="mx-3 mb-3 rounded-xl bg-muted/60 border border-border/50 px-4 py-3 font-mono">
        <p className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">Local Time</p>
        <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground leading-none">
          {manilaTime}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">{manilaDate}</p>
        <p className="text-[11px] text-muted-foreground">Q2 Deadline: {q2Deadline}</p>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-background/60 hover:bg-accent transition-colors text-[11px] font-semibold tracking-wide text-muted-foreground hover:text-foreground py-1.5 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
          Sync Dashboard
        </button>
      </div>

      {/* Footer */}
      <div className="p-3 border-t space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <LogOut className="h-4 w-4 mr-2" />}
          Sign out
        </Button>
      </div>
    </aside>
  )
}
