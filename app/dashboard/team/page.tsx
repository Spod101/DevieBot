'use client'

import { useState } from 'react'
import { useMembers } from '@/hooks/use-members'
import type { Member } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, UserCircle2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#a855f7',
]

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

interface MemberDialogProps {
  member: Partial<Member> | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function MemberDialog({ member, open, onClose, onSaved }: MemberDialogProps) {
  const supabase = createClient()
  const isNew = !member?.id

  const [name, setName] = useState(member?.name ?? '')
  const [color, setColor] = useState(member?.color ?? PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)

  // reset when dialog opens
  useState(() => {
    if (open) {
      setName(member?.name ?? '')
      setColor(member?.color ?? PRESET_COLORS[0])
    }
  })

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    if (isNew) {
      const { error } = await supabase.from('members').insert({ name: name.trim(), color })
      if (error) toast.error('Failed to add member')
      else toast.success('Member added')
    } else {
      const { error } = await supabase.from('members').update({ name: name.trim(), color }).eq('id', member!.id!)
      if (error) toast.error('Failed to update member')
      else toast.success('Member updated')
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Team Member' : 'Edit Member'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preview */}
          <div className="flex justify-center">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow"
              style={{ backgroundColor: color }}
            >
              {name ? getInitials(name) : <UserCircle2 className="h-8 w-8 opacity-60" />}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'white' : 'transparent',
                    boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
            {/* Custom color fallback */}
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="h-7 w-7 rounded cursor-pointer border-0 bg-transparent p-0"
              />
              <span className="text-xs text-muted-foreground">Custom color</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {isNew ? 'Add Member' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function TeamPage() {
  const { members, loading, fetchMembers, deleteMember } = useMembers()
  const [dialogMember, setDialogMember] = useState<Partial<Member> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openNew() {
    setDialogMember({})
    setDialogOpen(true)
  }

  function openEdit(member: Member) {
    setDialogMember(member)
    setDialogOpen(true)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await deleteMember(id)
    setDeletingId(null)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Members can be assigned to tasks on the board
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Member
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center gap-3 border-2 border-dashed border-border rounded-xl">
          <UserCircle2 className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No members yet</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Add your first team member to start assigning tasks</p>
          </div>
          <Button variant="outline" size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Member
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map(member => (
            <Card key={member.id} className="border-border/60">
              <CardContent className="flex items-center gap-4 py-3 px-4">
                {/* Avatar */}
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: member.color }}
                >
                  {getInitials(member.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{member.name}</p>
                    {member.telegram_id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                        Telegram
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {member.telegram_username && (
                      <span className="text-xs text-muted-foreground">@{member.telegram_username}</span>
                    )}
                    {member.telegram_username && (
                      <span className="text-muted-foreground/30 text-xs">·</span>
                    )}
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: member.color }}
                    />
                    <span className="text-xs text-muted-foreground font-mono">{member.color}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(member)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(member.id)}
                    disabled={deletingId === member.id}
                  >
                    {deletingId === member.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <MemberDialog
        member={dialogMember}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={fetchMembers}
      />
    </div>
  )
}
