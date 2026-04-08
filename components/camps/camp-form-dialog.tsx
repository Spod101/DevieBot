'use client'

import { useState, useEffect } from 'react'
import type { CodeCamp, CampStatus, Resource } from '@/types/database'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Trash2, Plus, Loader2, Link as LinkIcon } from 'lucide-react'

interface CampFormDialogProps {
  camp: Partial<CodeCamp> | null
  open: boolean
  onClose: () => void
  onSave: (camp: Partial<CodeCamp>) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function CampFormDialog({ camp, open, onClose, onSave, onDelete }: CampFormDialogProps) {
  const isNew = !camp?.id

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<CampStatus>('active')
  const [progress, setProgress] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [resources, setResources] = useState<Resource[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(camp?.name ?? '')
      setDescription(camp?.description ?? '')
      setStatus(camp?.status ?? 'active')
      setProgress(camp?.progress ?? 0)
      setStartDate(camp?.start_date ?? '')
      setEndDate(camp?.end_date ?? '')
      setResources(camp?.resources ?? [])
    }
  }, [open, camp])

  function addResource() {
    setResources(prev => [...prev, { title: '', url: '' }])
  }

  function updateResource(i: number, field: keyof Resource, value: string) {
    setResources(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function removeResource(i: number) {
    setResources(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    await onSave({
      ...camp,
      name: name.trim(),
      description: description || null,
      status,
      progress,
      start_date: startDate || null,
      end_date: endDate || null,
      resources: resources.filter(r => r.title && r.url),
    })
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!camp?.id || !onDelete) return
    setDeleting(true)
    await onDelete(camp.id)
    setDeleting(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New Code Camp' : 'Edit Code Camp'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Camp name..." autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this camp about?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as CampStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Progress ({progress}%)</Label>
              <Input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={e => setProgress(Number(e.target.value))}
                className="accent-primary"
              />
              <Progress value={progress} className="h-1.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" />
                Resources
              </Label>
              <Button variant="ghost" size="sm" onClick={addResource} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add Link
              </Button>
            </div>
            {resources.map((r, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Title"
                  value={r.title}
                  onChange={e => updateResource(i, 'title', e.target.value)}
                  className="w-32 shrink-0"
                />
                <Input
                  placeholder="https://..."
                  value={r.url}
                  onChange={e => updateResource(i, 'url', e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeResource(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {!isNew && onDelete && (
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {isNew ? 'Create Camp' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
