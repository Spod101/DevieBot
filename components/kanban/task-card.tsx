'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '@/types/database'
import { TASK_PRIORITIES } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CalendarDays,
  MessageSquare,
  GripVertical,
  AlertCircle,
} from 'lucide-react'
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const priority = TASK_PRIORITIES.find(p => p.value === task.priority)
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'done'
  const isDueToday = task.due_date && isToday(new Date(task.due_date))

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group', isDragging && 'opacity-50')}
    >
      <Card
        className="p-3 cursor-pointer hover:shadow-md transition-shadow border-border/60 hover:border-border"
        onClick={() => onClick(task)}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="flex-1 min-w-0">
            {/* Title */}
            <p className={cn(
              'text-sm font-medium leading-snug',
              task.status === 'done' && 'line-through text-muted-foreground'
            )}>
              {task.title}
            </p>

            {/* Description preview */}
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Tags + Assignees as pills */}
            {((task.tags && task.tags.length > 0) || (task.assignees && task.assignees.length > 0)) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {task.tags?.slice(0, 3).map(tag => (
                  <span
                    key={tag.id}
                    className="px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                    style={{ backgroundColor: tag.color + '33', color: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
                {task.tags && task.tags.length > 3 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                    +{task.tags.length - 3}
                  </span>
                )}
                {task.assignees?.slice(0, 3).map(member => (
                  <span
                    key={member.id}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full font-medium"
                    style={{ backgroundColor: member.color + '33', color: member.color }}
                    title={member.name}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: member.color }}
                    />
                    {member.name.split(' ')[0]}
                  </span>
                ))}
                {task.assignees && task.assignees.length > 3 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-muted text-muted-foreground">
                    +{task.assignees.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 mt-2">
              {priority && (
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', priority.badge)}>
                  {priority.label}
                </Badge>
              )}

              {task.due_date && (
                <div className={cn(
                  'flex items-center gap-1 text-[10px] ml-auto',
                  isOverdue ? 'text-destructive' : isDueToday ? 'text-yellow-500' : 'text-muted-foreground'
                )}>
                  {isOverdue && <AlertCircle className="h-3 w-3" />}
                  <CalendarDays className="h-3 w-3" />
                  {format(new Date(task.due_date), 'MMM d')}
                </div>
              )}

              {task.comments && task.comments.length > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {task.comments.length}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
