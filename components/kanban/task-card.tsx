'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@/types/database'
import { taskCode } from '@/types/database'
import { TASK_PRIORITIES } from '@/lib/constants'
import { memberColor, memberShortLabel } from '@/lib/member-utils'
import { cn } from '@/lib/utils'
import { CalendarDays, MessageSquare, GripVertical, AlertCircle } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'

interface TaskCardProps {
  task: Task
  onClick: (task: Task) => void
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = { transform: CSS.Transform.toString(transform), transition }

  const priority   = TASK_PRIORITIES.find(p => p.value === task.priority)
  const isOverdue  = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'done'
  const isDueToday = task.due_date && isToday(new Date(task.due_date))

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group', isDragging && 'opacity-40')}
    >
      <div
        className="p-3 rounded-xl cursor-pointer transition-all"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        onClick={() => onClick(task)}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--ring)'
          ;(e.currentTarget as HTMLElement).style.background  = 'var(--accent)'
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          ;(e.currentTarget as HTMLElement).style.background  = 'var(--card)'
        }}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing shrink-0 transition-opacity opacity-0 group-hover:opacity-40 text-muted-foreground"
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Code + Title */}
            <div className="flex items-start gap-1.5 mb-1">
              <span
                className="shrink-0 text-[10px] font-bold mt-0.5 select-none tabular-nums text-muted-foreground/40"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {taskCode(task)}
              </span>
              <p
                className={cn(
                  'text-sm font-medium leading-snug',
                  task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
                )}
              >
                {task.title}
              </p>
            </div>

            {/* Description preview */}
            {task.description && (
              <p className="text-xs mb-2 line-clamp-2 text-muted-foreground">
                {task.description}
              </p>
            )}

            {/* Tags + Assignees */}
            {((task.tags && task.tags.length > 0) || (task.assignees && task.assignees.length > 0)) && (
              <div className="flex flex-wrap gap-1 mb-2">
                {task.tags?.slice(0, 3).map(tag => (
                  <span
                    key={tag.id}
                    className="px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                    style={{
                      backgroundColor: tag.color + '22',
                      color: tag.color,
                      border: `1px solid ${tag.color}30`,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
                {task.tags && task.tags.length > 3 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                    +{task.tags.length - 3}
                  </span>
                )}
                {task.assignees?.slice(0, 3).map(member => {
                  const color = memberColor(member)
                  return (
                    <span
                      key={member.id}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                      style={{
                        backgroundColor: color + '1a',
                        color,
                        border: `1px solid ${color}30`,
                      }}
                      title={memberShortLabel(member)}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      {memberShortLabel(member)}
                    </span>
                  )
                })}
                {task.assignees && task.assignees.length > 3 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                    +{task.assignees.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2">
              {/* Only show badge for high/urgent */}
              {priority && (priority.value === 'high' || priority.value === 'urgent') && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{
                    background: `color-mix(in srgb, ${priority.hex} 14%, transparent)`,
                    color: priority.hex,
                    border: `1px solid color-mix(in srgb, ${priority.hex} 25%, transparent)`,
                    fontFamily: 'var(--font-jetbrains-mono)',
                  }}
                >
                  {priority.label}
                </span>
              )}

              {task.due_date && (
                <div
                  className={cn(
                    'flex items-center gap-1 text-[10px] ml-auto',
                    isOverdue
                      ? 'text-destructive'
                      : isDueToday
                        ? 'text-yellow-500'
                        : 'text-muted-foreground/60'
                  )}
                  style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  {isOverdue && <AlertCircle className="h-3 w-3" />}
                  <CalendarDays className="h-3 w-3" />
                  {format(new Date(task.due_date), 'MMM d')}
                </div>
              )}

              {task.comments && task.comments.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                  <MessageSquare className="h-3 w-3" />
                  {task.comments.length}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
