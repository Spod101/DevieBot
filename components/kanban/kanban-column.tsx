'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, TaskStatus } from '@/types/database'
import { TaskCard } from './task-card'
import { Plus } from 'lucide-react'

interface KanbanColumnProps {
  status: TaskStatus
  label: string
  color: string
  hex: string
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: (status: TaskStatus) => void
}

export function KanbanColumn({ status, label, hex, tasks, onTaskClick, onAddTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex min-w-0 flex-col">
      {/* ── Column header ─────────────────────────── */}
      <div
        className="flex items-center justify-between mb-2 px-3 py-2.5 rounded-xl"
        style={{
          background: `color-mix(in srgb, ${hex} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${hex} 22%, transparent)`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: hex }} />
          <span
            className="text-xs font-semibold tracking-wide"
            style={{ color: hex }}
          >
            {label}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums font-bold"
            style={{
              background: `color-mix(in srgb, ${hex} 16%, transparent)`,
              color: hex,
              fontFamily: 'var(--font-jetbrains-mono)',
            }}
          >
            {tasks.length}
          </span>
        </div>

        <button
          onClick={() => onAddTask(status)}
          className="h-6 w-6 flex items-center justify-center rounded-lg transition-all"
          style={{ color: `color-mix(in srgb, ${hex} 60%, transparent)` }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${hex} 18%, transparent)`
            ;(e.currentTarget as HTMLElement).style.color = hex
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLElement).style.color = `color-mix(in srgb, ${hex} 60%, transparent)`
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Drop zone ─────────────────────────────── */}
      <div
        ref={setNodeRef}
        className="min-h-[220px] rounded-xl p-2 space-y-2 transition-all lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto"
        style={{
          background: isOver
            ? `color-mix(in srgb, ${hex} 6%, transparent)`
            : 'var(--muted)',
          border: isOver
            ? `1px solid color-mix(in srgb, ${hex} 30%, transparent)`
            : '1px solid var(--border)',
        }}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div
            className="flex items-center justify-center h-24 text-xs text-muted-foreground/50 cursor-pointer rounded-lg transition-all hover:text-muted-foreground"
            onClick={() => onAddTask(status)}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${hex} 5%, transparent)`
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            + Add task
          </div>
        )}
      </div>
    </div>
  )
}
