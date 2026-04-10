'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Task, TaskStatus, TaskPriority, Tag, TaskComment, Member } from '@/types/database'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/constants'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Trash2, Send, Loader2, Tag as TagIcon, Users } from 'lucide-react'
import { memberColor, memberLabel } from '@/lib/member-utils'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface TaskDialogProps {
  task: Partial<Task> | null
  open: boolean
  onClose: () => void
  onSave: (task: Partial<Task> & { title: string }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  defaultStatus?: TaskStatus
}

export function TaskDialog({ task, open, onClose, onSave, onDelete, defaultStatus }: TaskDialogProps) {
  const supabase = createClient()
  const isNew = !task?.id

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [status, setStatus] = useState<TaskStatus>(defaultStatus || 'todo')
  const [dueDate, setDueDate] = useState('')
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [postingComment, setPostingComment] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '')
      setDescription(task?.description ?? '')
      setPriority(task?.priority ?? 'medium')
      setStatus(task?.status ?? defaultStatus ?? 'todo')
      setDueDate(task?.due_date ?? '')
      setSelectedTags(task?.tags ?? [])
      setSelectedMember(task?.assignees?.[0] ?? null)
      fetchAllTags()
      fetchAllMembers()
      if (task?.id) fetchComments(task.id)
      else setComments([])
    }
  }, [open, task])

  async function fetchAllTags() {
    const { data } = await supabase.from('tags').select('*').order('name')
    if (data) setAllTags(data)
  }

  async function fetchAllMembers() {
    const { data } = await supabase.from('members').select('*').order('created_at', { ascending: true })
    if (data) setAllMembers(data)
  }

  function toggleAssignee(member: Member) {
    setSelectedMember(prev => prev?.id === member.id ? null : member)
  }

  async function fetchComments(taskId: string) {
    const { data } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  function toggleTag(tag: Tag) {
    setSelectedTags(prev =>
      prev.find(t => t.id === tag.id)
        ? prev.filter(t => t.id !== tag.id)
        : [...prev, tag]
    )
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const assigned_to = selectedMember
      ? (selectedMember.name ?? selectedMember.telegram_username ?? selectedMember.telegram_id ?? null)
      : null
    await onSave({
      ...task,
      title: title.trim(),
      description: description || null,
      priority,
      status,
      due_date: dueDate || null,
      assigned_to,
      tags: selectedTags,
    })
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!task?.id || !onDelete) return
    setDeleting(true)
    await onDelete(task.id)
    setDeleting(false)
    onClose()
  }

  async function postComment() {
    if (!newComment.trim() || !task?.id) return
    setPostingComment(true)
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: task.id, content: newComment.trim() })
      .select()
      .single()
    if (!error && data) {
      setComments(prev => [...prev, data])
      setNewComment('')
    } else {
      toast.error('Failed to post comment')
    }
    setPostingComment(false)
  }

  async function deleteComment(commentId: string) {
    await supabase.from('task_comments').delete().eq('id', commentId)
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New Task' : 'Edit Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title..."
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add details, context, or notes..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <TagIcon className="h-3.5 w-3.5" />
              Tags
            </Label>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const selected = !!selectedTags.find(t => t.id === tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium transition-all border',
                      selected ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                    )}
                    style={{
                      backgroundColor: selected ? tag.color + '22' : 'transparent',
                      borderColor: tag.color,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          </div>

          {allMembers.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Assignees
              </Label>
              <div className="flex flex-wrap gap-2">
                {allMembers.map(member => {
                  const selected = selectedMember?.id === member.id
                  const color = memberColor(member)
                  return (
                    <button
                      key={member.id}
                      onClick={() => toggleAssignee(member)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all border',
                        selected
                          ? 'border-transparent text-white'
                          : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30'
                      )}
                      style={selected ? { backgroundColor: color } : {}}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {memberLabel(member)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!isNew && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Comments</Label>

                {comments.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {comments.map(comment => (
                      <div key={comment.id} className="group flex gap-2 text-sm bg-muted/50 rounded-lg p-3">
                        <div className="flex-1">
                          <p className="text-foreground">{comment.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {format(new Date(comment.created_at), 'MMM d, yyyy · h:mm a')}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && postComment()}
                  />
                  <Button
                    size="icon"
                    onClick={postComment}
                    disabled={!newComment.trim() || postingComment}
                  >
                    {postingComment
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isNew && onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="mr-auto"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {isNew ? 'Create Task' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
