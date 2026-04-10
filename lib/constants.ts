import type { TaskStatus, TaskPriority } from '@/types/database'

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string; hex: string }[] = [
  { value: 'todo',        label: 'To Do',       color: 'bg-slate-500',  hex: 'rgba(148,163,184,0.7)' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-500',   hex: '#60a5fa' },
  { value: 'in_review',   label: 'In Review',   color: 'bg-yellow-500', hex: '#eab308' },
  { value: 'blocked',     label: 'Blocked',     color: 'bg-red-500',    hex: '#ff4444' },
  { value: 'done',        label: 'Done',        color: 'bg-green-500',  hex: '#10b981' },
]

export const TASK_PRIORITIES: { value: TaskPriority; label: string; color: string; badge: string; hex: string }[] = [
  { value: 'low',    label: 'Low',    color: 'text-slate-400', badge: 'border-white/10 text-white/40 bg-white/5',                       hex: 'rgba(255,255,255,0.4)'  },
  { value: 'medium', label: 'Medium', color: 'text-blue-400',  badge: 'border-blue-500/20 text-blue-400 bg-blue-500/10',                 hex: '#60a5fa'                 },
  { value: 'high',   label: 'High',   color: 'text-orange-400',badge: 'border-orange-500/20 text-orange-400 bg-orange-500/10',           hex: '#f97316'                 },
  { value: 'urgent', label: 'Urgent', color: 'text-red-400',   badge: 'border-red-500/20 text-red-400 bg-red-500/10',                    hex: '#ff4444'                 },
]
