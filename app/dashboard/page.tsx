'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  KanbanSquare, Tent, CheckCircle2, Clock, AlertCircle, Loader2,
  TrendingUp, CircleDashed,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import type { Task, CodeCamp } from '@/types/database'
import { TASK_PRIORITIES } from '@/lib/constants'
import Link from 'next/link'

export default function OverviewPage() {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [camps, setCamps] = useState<CodeCamp[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const [tasksRes, campsRes] = await Promise.all([
        supabase.from('tasks').select('*, tags:task_tags(tag:tags(*))'),
        supabase.from('code_camps').select('*').order('created_at', { ascending: false }),
      ])
      if (tasksRes.data) {
        setTasks(tasksRes.data.map((t: any) => ({
          ...t,
          tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean) || [],
        })))
      }
      if (campsRes.data) setCamps(campsRes.data)
      setLoading(false)
    }
    fetchAll()
  }, [])

  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length
  const blockedTasks = tasks.filter(t => t.status === 'blocked').length
  const urgentTasks = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length
  const overdueTasks = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done'
  ).length
  const activeCamps = camps.filter(c => c.status === 'active').length

  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const statCards = [
    {
      label: 'Total Tasks',
      value: totalTasks,
      icon: KanbanSquare,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Completed',
      value: doneTasks,
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      sub: totalTasks ? `${Math.round((doneTasks / totalTasks) * 100)}%` : '0%',
    },
    {
      label: 'In Progress',
      value: inProgressTasks,
      icon: TrendingUp,
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
    },
    {
      label: 'Blocked',
      value: blockedTasks,
      icon: AlertCircle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Active Camps',
      value: activeCamps,
      icon: Tent,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Overdue',
      value: overdueTasks,
      icon: Clock,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className={cn('inline-flex p-2 rounded-lg mb-3', stat.bg)}>
                <stat.icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
              {stat.sub && <div className="text-xs text-muted-foreground">{stat.sub} done</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Code Camps */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Code Camps</CardTitle>
              <Link href="/dashboard/camps" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {camps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No camps yet</p>
            ) : (
              camps.slice(0, 5).map(camp => (
                <Link key={camp.id} href={`/dashboard/camps/${camp.id}`}>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      camp.status === 'active' ? 'bg-green-500' :
                      camp.status === 'paused' ? 'bg-yellow-500' :
                      camp.status === 'completed' ? 'bg-blue-500' : 'bg-gray-500'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{camp.name}</p>
                      <Progress value={camp.progress} className="h-1 mt-1" />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{camp.progress}%</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Recent Tasks</CardTitle>
              <Link href="/dashboard/board" className="text-xs text-primary hover:underline">
                View board
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No tasks yet</p>
            ) : (
              recentTasks.map(task => {
                const priority = TASK_PRIORITIES.find(p => p.value === task.priority)
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <CircleDashed className={cn('h-3.5 w-3.5 shrink-0', priority?.color)} />
                    <span className={cn(
                      'text-sm flex-1 truncate',
                      task.status === 'done' && 'line-through text-muted-foreground'
                    )}>
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className={cn(
                        'text-[10px] shrink-0',
                        new Date(task.due_date) < new Date() && task.status !== 'done'
                          ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {format(new Date(task.due_date), 'MMM d')}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Urgent tasks alert */}
      {urgentTasks > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                {urgentTasks} urgent task{urgentTasks !== 1 ? 's' : ''} need attention
              </p>
              <p className="text-xs text-muted-foreground">
                {overdueTasks > 0 && `${overdueTasks} task${overdueTasks !== 1 ? 's' : ''} overdue · `}
                Check your boards
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
