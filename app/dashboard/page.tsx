'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  KanbanSquare, CheckCircle2, Clock, AlertCircle, Loader2,
  TrendingUp, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Task } from '@/types/database'
import { taskCode } from '@/types/database'
import Link from 'next/link'

export default function OverviewPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const { data } = await supabase.from('tasks').select('*, tags:task_tags(tag:tags(*))')
      if (data) {
        setTasks(data.map((t: any) => ({
          ...t,
          tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean) || [],
        })))
      }
      setLoading(false)
    }
    fetchAll()
  }, [])

  const totalTasks   = tasks.length
  const doneTasks    = tasks.filter(t => t.status === 'done').length
  const inProgress   = tasks.filter(t => t.status === 'in_progress').length
  const blocked      = tasks.filter(t => t.status === 'blocked').length
  const urgentTasks  = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length
  const overdueTasks = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done'
  ).length
  const donePercent  = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 12)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  const statCards = [
    { label: 'Total Tasks',  value: totalTasks,  icon: KanbanSquare, color: 'var(--primary)', bg: 'color-mix(in srgb, var(--primary) 12%, transparent)' },
    { label: 'Completed',    value: doneTasks,   icon: CheckCircle2, color: '#10b981',        bg: 'rgba(16,185,129,0.1)',  sub: `${donePercent}% rate` },
    { label: 'In Progress',  value: inProgress,  icon: TrendingUp,   color: '#eab308',        bg: 'rgba(234,179,8,0.1)'  },
    { label: 'Blocked',      value: blocked,     icon: AlertCircle,  color: '#ef4444',        bg: 'rgba(239,68,68,0.1)'  },
    { label: 'Urgent',       value: urgentTasks, icon: AlertCircle,  color: '#a78bfa',        bg: 'rgba(167,139,250,0.1)'},
    { label: 'Overdue',      value: overdueTasks,icon: Clock,        color: '#f97316',        bg: 'rgba(249,115,22,0.1)' },
  ]

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────── */}
      <div>
        <div className="mono-tag mb-2">
          <span className="lime-dot" />
          <span>Operations Dashboard</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* ── KPI Grid ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(stat => (
          <div key={stat.label} className="glass-panel rounded-2xl p-4">
            <div className="inline-flex p-2 rounded-xl mb-3" style={{ background: stat.bg }}>
              <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
            </div>
            <div
              className="text-2xl font-bold tabular-nums leading-none"
              style={{ color: stat.color, fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {stat.value}
            </div>
            <div className="text-xs mt-1 text-muted-foreground">{stat.label}</div>
            {stat.sub && <div className="text-[10px] mt-0.5 text-muted-foreground/60">{stat.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Completion bar ─────────────────────────── */}
      {totalTasks > 0 && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Overall Completion</span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: 'var(--primary)', fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {donePercent}%
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-border">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${donePercent}%`,
                background: 'linear-gradient(90deg, var(--primary), var(--devcon-sky))',
              }}
            />
          </div>
          <div
            className="flex justify-between mt-1.5 text-[10px] text-muted-foreground/50"
            style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
          >
            <span>0</span>
            <span>{totalTasks} total tasks</span>
          </div>
        </div>
      )}

      {/* ── Recent Tasks ───────────────────────────── */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="mono-tag">
            <KanbanSquare className="h-3 w-3" />
            <span>Recent Tasks</span>
          </div>
          <Link
            href="/dashboard/board"
            className="flex items-center gap-1 text-[10px] transition-opacity hover:opacity-70"
            style={{
              color: 'var(--primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            Board <ArrowRight className="h-2.5 w-2.5" />
          </Link>
        </div>

        {recentTasks.length === 0 ? (
          <p className="text-sm text-center py-6 text-muted-foreground">No tasks yet</p>
        ) : (
          <div className="space-y-0.5">
            {recentTasks.map(task => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
              return (
                <div key={task.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                  <span
                    className="shrink-0 text-[10px] text-muted-foreground/50"
                    style={{ fontFamily: 'var(--font-jetbrains-mono)', minWidth: '38px' }}
                  >
                    {taskCode(task)}
                  </span>
                  <span
                    className={cn(
                      'text-sm flex-1 truncate',
                      task.status === 'done'
                        ? 'line-through text-muted-foreground'
                        : 'text-foreground'
                    )}
                  >
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span
                      className={cn(
                        'text-[10px] shrink-0',
                        isOverdue ? 'text-destructive' : 'text-muted-foreground/60'
                      )}
                      style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                    >
                      {format(new Date(task.due_date), 'MMM d')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Urgent alert ───────────────────────────── */}
      {urgentTasks > 0 && (
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-semibold text-destructive">
              {urgentTasks} urgent task{urgentTasks !== 1 ? 's' : ''} need attention
            </p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {overdueTasks > 0 && `${overdueTasks} overdue · `}Review your boards
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
