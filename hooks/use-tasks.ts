'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task, TaskStatus, Member } from '@/types/database'
import { toast } from 'sonner'

export function useTasks(campId?: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchTasks = useCallback(async () => {
    setLoading(true)

    // ── 1. Fetch tasks + tags (single-level join, always reliable) ───────
    let query = supabase
      .from('tasks')
      .select('*, tags:task_tags(tag:tags(*))')
      .order('order_index', { ascending: true })

    if (campId === null) {
      query = query.is('camp_id', null)
    } else if (campId) {
      query = query.eq('camp_id', campId)
    }

    const { data: tasksData, error } = await query
    if (error) {
      toast.error('Failed to load tasks')
      setLoading(false)
      return
    }

    // ── 2. Fetch assignees separately and merge ──────────────────────────
    const taskIds = (tasksData || []).map((t: any) => t.id)
    const assigneesMap: Record<string, Member[]> = {}

    if (taskIds.length > 0) {
      const { data: assignments } = await supabase
        .from('task_assignments')
        .select('task_id, member:members(*)')
        .in('task_id', taskIds)

      ;(assignments || []).forEach((a: any) => {
        if (!assigneesMap[a.task_id]) assigneesMap[a.task_id] = []
        if (a.member) assigneesMap[a.task_id].push(a.member)
      })
    }

    // ── 3. Normalize ─────────────────────────────────────────────────────
    const normalized: Task[] = (tasksData || []).map((t: any) => ({
      ...t,
      tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean) || [],
      assignees: assigneesMap[t.id] || [],
    }))

    setTasks(normalized)
    setLoading(false)
  }, [campId])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  async function createTask(payload: Partial<Task> & { title: string }) {
    const tasksInCol = tasks.filter(t => t.status === (payload.status || 'todo'))

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: payload.title,
        description: payload.description ?? null,
        priority: payload.priority ?? 'medium',
        status: payload.status ?? 'todo',
        due_date: payload.due_date ?? null,
        camp_id: payload.camp_id ?? campId ?? null,
        order_index: tasksInCol.length,
      })
      .select()
      .single()

    if (error) {
      toast.error('Failed to create task')
      return null
    }

    if (payload.tags?.length) {
      await supabase.from('task_tags').insert(
        payload.tags.map((tag: any) => ({ task_id: data.id, tag_id: tag.id }))
      )
    }

    if (payload.assignees?.length) {
      await supabase.from('task_assignments').insert(
        payload.assignees.map((m: any) => ({ task_id: data.id, member_id: m.id }))
      )
    }

    toast.success('Task created')
    await fetchTasks()
    return data
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    const { tags, comments, assignees, ...rest } = updates as any

    const { error } = await supabase.from('tasks').update(rest).eq('id', id)
    if (error) {
      toast.error('Failed to update task')
      return
    }

    if (tags !== undefined) {
      await supabase.from('task_tags').delete().eq('task_id', id)
      if (tags.length > 0) {
        await supabase.from('task_tags').insert(
          tags.map((tag: any) => ({ task_id: id, tag_id: tag.id }))
        )
      }
    }

    if (assignees !== undefined) {
      await supabase.from('task_assignments').delete().eq('task_id', id)
      if (assignees.length > 0) {
        await supabase.from('task_assignments').insert(
          assignees.map((m: any) => ({ task_id: id, member_id: m.id }))
        )
      }
    }

    await fetchTasks()
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete task')
      return
    }
    toast.success('Task deleted')
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function moveTask(taskId: string, newStatus: TaskStatus) {
    setTasks(prev =>
      prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
    )
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
  }

  async function reorderTasks(reordered: Task[]) {
    setTasks(reordered)
    await Promise.all(
      reordered.map((t, i) =>
        supabase.from('tasks').update({ order_index: i }).eq('id', t.id)
      )
    )
  }

  return { tasks, loading, fetchTasks, createTask, updateTask, deleteTask, moveTask, reorderTasks }
}
