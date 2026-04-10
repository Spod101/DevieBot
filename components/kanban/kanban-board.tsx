'use client'

import { useState, useMemo } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Task, TaskStatus } from '@/types/database'
import { TASK_STATUSES } from '@/lib/constants'
import { KanbanColumn } from './kanban-column'
import { TaskCard } from './task-card'
import { TaskDialog } from './task-dialog'
import { useTasks } from '@/hooks/use-tasks'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Search, SlidersHorizontal, Plus, Loader2 } from 'lucide-react'
import type { TaskPriority } from '@/types/database'

interface KanbanBoardProps {
  campId?: string | null
  title?: string
}

export function KanbanBoard({ campId, title }: KanbanBoardProps) {
  const { tasks, loading, createTask, updateTask, deleteTask, moveTask, reorderTasks } = useTasks(campId)

  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [dialogTask, setDialogTask] = useState<Partial<Task> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>('todo')

  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority
      return matchSearch && matchPriority
    })
  }, [tasks, search, filterPriority])

  function getColumnTasks(status: TaskStatus) {
    return filteredTasks.filter(t => t.status === status)
  }

  function handleDragStart(e: DragStartEvent) {
    const task = tasks.find(t => t.id === e.active.id)
    if (task) setActiveTask(task)
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    // Dropped over a column (status)
    const overStatus = TASK_STATUSES.find(s => s.value === overId)?.value as TaskStatus | undefined

    if (overStatus) {
      const activeTask = tasks.find(t => t.id === activeId)
      if (activeTask && activeTask.status !== overStatus) {
        moveTask(activeId, overStatus)
      }
      return
    }

    // Dropped over another task
    const overTask = tasks.find(t => t.id === overId)
    const activeTaskFound = tasks.find(t => t.id === activeId)
    if (!overTask || !activeTaskFound) return

    if (activeTaskFound.status !== overTask.status) {
      moveTask(activeId, overTask.status)
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveTask(null)
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    if (activeId === overId) return

    const colTasks = tasks.filter(t => {
      const activeTask = tasks.find(t => t.id === activeId)
      return t.status === activeTask?.status
    })

    const oldIdx = colTasks.findIndex(t => t.id === activeId)
    const newIdx = colTasks.findIndex(t => t.id === overId)

    if (oldIdx !== -1 && newIdx !== -1) {
      const reordered = arrayMove(colTasks, oldIdx, newIdx)
      const allOther = tasks.filter(t => {
        const activeTask = tasks.find(t => t.id === activeId)
        return t.status !== activeTask?.status
      })
      reorderTasks([...allOther, ...reordered])
    }
  }

  function openNewTask(status: TaskStatus = 'todo') {
    setDefaultStatus(status)
    setDialogTask({ camp_id: campId ?? null })
    setDialogOpen(true)
  }

  function openEditTask(task: Task) {
    setDialogTask(task)
    setDialogOpen(true)
  }

  async function handleSave(payload: Partial<Task> & { title: string }) {
    if (payload.id) {
      await updateTask(payload.id, payload)
    } else {
      await createTask({ ...payload, camp_id: campId ?? null })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Board toolbar ───────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        {/* Priority filter */}
        <Select value={filterPriority} onValueChange={v => setFilterPriority(v as any)}>
          <SelectTrigger className="w-36 text-sm">
            <SlidersHorizontal className="h-3.5 w-3.5 mr-2 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        {/* Add task */}
        <button
          onClick={() => openNewTask()}
          className="btn-lime flex items-center gap-2 px-4 py-2 text-sm font-bold"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      </div>

      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {TASK_STATUSES.map(col => (
            <KanbanColumn
              key={col.value}
              status={col.value}
              label={col.label}
              color={col.color}
              hex={col.hex}
              tasks={getColumnTasks(col.value)}
              onTaskClick={openEditTask}
              onAddTask={openNewTask}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="rotate-2 opacity-90">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Task dialog */}
      <TaskDialog
        task={dialogTask}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={dialogTask?.id ? deleteTask : undefined}
        defaultStatus={defaultStatus}
      />
    </div>
  )
}
