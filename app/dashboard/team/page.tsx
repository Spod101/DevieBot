'use client'

import { useState, useMemo } from 'react'
import { useMembers } from '@/hooks/use-members'
import { memberColor, memberLabel, memberInitials } from '@/lib/member-utils'
import { Loader2, Trash2, MessageCircle, Users, UserPlus, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const EMPTY_FORM = { name: '', telegram_username: '', telegram_id: '', role: '' }

export default function TeamPage() {
  const { members, loading, createMember, updateMember, deleteMember } = useMembers()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)

  const now          = new Date()
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7); startOfWeek.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const newThisWeek  = members.filter(m => m.created_at && new Date(m.created_at) >= startOfWeek)
  const newThisMonth = members.filter(m => m.created_at && new Date(m.created_at) >= startOfMonth)

  // Derive unique roles from members, sorted alphabetically
  const roles = useMemo(() => {
    const set = new Set(members.map(m => m.role ?? 'unassigned'))
    return [...set].sort()
  }, [members])

  // Group members by role
  const grouped = useMemo(() =>
    roles.reduce<Record<string, typeof members>>((acc, role) => {
      acc[role] = members.filter(m => (m.role ?? 'unassigned') === role)
      return acc
    }, {}),
  [members, roles])

  async function handleDelete(id: string) {
    setDeletingId(Number(id))
    await deleteMember(id)
    setDeletingId(null)
  }

  async function handleRoleChange(id: string, role: string) {
    if (!role.trim()) return
    setUpdatingId(Number(id))
    await updateMember(id, { role: role.trim() })
    setUpdatingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.role.trim()) return
    setSubmitting(true)
    await createMember({
      name:              form.name.trim(),
      role:              form.role.trim(),
      telegram_username: form.telegram_username.trim() || undefined,
      telegram_id:       form.telegram_id.trim()       || undefined,
    })
    setSubmitting(false)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono-tag mb-2">
            <span className="lime-dot" />
            <span>Members</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Team</h1>
          <p className="text-sm mt-1 text-muted-foreground">
            Members auto-register when they message in Telegram, or add them manually here.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0 mt-1">
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      {/* ── Add Member Dialog ───────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Telegram fields are optional — useful for members not yet in the group.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">

            <div className="space-y-1.5">
              <Label htmlFor="m-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="m-name"
                placeholder="e.g. Dale Reyes"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-role">
                Role <span className="text-destructive">*</span>
              </Label>
              {/* datalist gives autocomplete from existing roles while still allowing new ones */}
              <Input
                id="m-role"
                list="role-suggestions"
                placeholder="e.g. cohort4, admin, mentor"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                required
              />
              <datalist id="role-suggestions">
                {roles.filter(r => r !== 'unassigned').map(r => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-username">
                Telegram Username{' '}
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">@</span>
                <Input
                  id="m-username"
                  placeholder="username"
                  value={form.telegram_username}
                  onChange={e => setForm(f => ({ ...f, telegram_username: e.target.value.replace(/^@/, '') }))}
                  className="pl-7"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-tid">
                Telegram ID{' '}
                <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <Input
                id="m-tid"
                placeholder="e.g. 123456789"
                value={form.telegram_id}
                onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
              />
            </div>

            <DialogFooter showCloseButton>
              <Button type="submit" disabled={submitting || !form.name.trim() || !form.role.trim()}>
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <UserPlus className="h-4 w-4" />
                }
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Stats row ──────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Users,        label: 'Total Members',  value: members.length,       color: 'var(--primary)' },
            { icon: UserPlus,     label: 'New this week',  value: newThisWeek.length,   color: 'var(--devcon-sky)' },
            { icon: CalendarDays, label: 'New this month', value: newThisMonth.length,  color: '#10b981' },
          ].map(stat => (
            <div key={stat.label} className="glass-panel rounded-2xl p-5 flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${stat.color} 14%, transparent)` }}
              >
                <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
              </div>
              <div>
                <div
                  className="text-3xl font-bold tabular-nums leading-none"
                  style={{ color: stat.color, fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  {stat.value}
                </div>
                <div className="text-xs mt-1 text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Member list grouped by role ─────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
        </div>

      ) : members.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-48 text-center gap-3 rounded-2xl"
          style={{ border: '2px dashed var(--border)', background: 'var(--muted)' }}
        >
          <MessageCircle className="h-10 w-10 opacity-20" style={{ color: 'var(--primary)' }} />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No members yet</p>
            <p className="text-xs mt-1 text-muted-foreground/60">
              Add members manually or wait for them to message in your Telegram group.
            </p>
          </div>
        </div>

      ) : (
        <div className="space-y-6">
          {roles.map(role => {
            const roleMembers = grouped[role] ?? []
            if (!roleMembers.length) return null
            return (
              <div key={role}>

                {/* Role section header */}
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="text-xs font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--primary)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  >
                    {role}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {roleMembers.length} member{roleMembers.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Table */}
                <div
                  className="rounded-2xl overflow-hidden overflow-x-auto"
                  style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
                >
                  <div
                    className="grid gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                    style={{
                      gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1.2fr auto',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--muted)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  >
                    <span>Member</span>
                    <span>Username</span>
                    <span>Telegram ID</span>
                    <span>Joined</span>
                    <span>Role</span>
                    <span />
                  </div>

                  {roleMembers.map((member, i) => {
                    const color  = memberColor(member)
                    const name   = memberLabel(member)
                    const isLast = i === roleMembers.length - 1
                    return (
                      <div
                        key={member.id}
                        className="grid items-center gap-4 px-5 py-3 group transition-colors"
                        style={{
                          gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1.2fr auto',
                          borderBottom: isLast ? 'none' : '1px solid var(--border)',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {/* Avatar + name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 select-none"
                            style={{
                              background: `color-mix(in srgb, ${color} 15%, transparent)`,
                              border: `1.5px solid color-mix(in srgb, ${color} 35%, transparent)`,
                              color,
                            }}
                          >
                            {memberInitials(member)}
                          </div>
                          <span className="text-sm font-medium text-foreground truncate">{name}</span>
                        </div>

                        {/* Username */}
                        <span
                          className="text-sm truncate"
                          style={{
                            color: member.telegram_username ? 'var(--devcon-sky)' : 'var(--muted-foreground)',
                            fontFamily: 'var(--font-jetbrains-mono)',
                            opacity: member.telegram_username ? 1 : 0.4,
                          }}
                        >
                          {member.telegram_username ? `@${member.telegram_username}` : '—'}
                        </span>

                        {/* Telegram ID */}
                        <span
                          className="text-sm text-muted-foreground truncate"
                          style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                        >
                          {member.telegram_id ?? '—'}
                        </span>

                        {/* Joined */}
                        <span
                          className="text-sm text-muted-foreground whitespace-nowrap"
                          style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                        >
                          {member.created_at ? format(new Date(member.created_at), 'MMM d, yyyy') : '—'}
                        </span>

                        {/* Role — inline editable */}
                        <div className="flex items-center">
                          {updatingId === member.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <input
                              list="role-suggestions"
                              defaultValue={member.role ?? ''}
                              onBlur={e => {
                                const val = e.target.value.trim()
                                if (val && val !== (member.role ?? '')) {
                                  handleRoleChange(String(member.id), val)
                                }
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                              className="text-xs w-full rounded-md border border-transparent bg-transparent px-2 py-1 focus:outline-none focus:border-input focus:bg-background transition-all"
                              style={{ fontFamily: 'var(--font-jetbrains-mono)', color: 'var(--primary)' }}
                            />
                          )}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(String(member.id))}
                          disabled={deletingId === member.id}
                          className="h-7 w-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 opacity-0 group-hover:opacity-100 text-muted-foreground"
                          onMouseEnter={e => {
                            ;(e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'
                            ;(e.currentTarget as HTMLElement).style.color = '#ef4444'
                          }}
                          onMouseLeave={e => {
                            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                            ;(e.currentTarget as HTMLElement).style.color = ''
                          }}
                        >
                          {deletingId === member.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
