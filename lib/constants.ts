import type { TaskStatus, TaskPriority } from '@/types/database'

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'todo', label: 'To Do', color: 'bg-slate-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-500' },
  { value: 'in_review', label: 'In Review', color: 'bg-yellow-500' },
  { value: 'blocked', label: 'Blocked', color: 'bg-red-500' },
  { value: 'done', label: 'Done', color: 'bg-green-500' },
]

export const TASK_PRIORITIES: { value: TaskPriority; label: string; color: string; badge: string }[] = [
  { value: 'low', label: 'Low', color: 'text-slate-400', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  { value: 'medium', label: 'Medium', color: 'text-blue-400', badge: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'high', label: 'High', color: 'text-orange-400', badge: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300' },
  { value: 'urgent', label: 'Urgent', color: 'text-red-400', badge: 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300' },
]
