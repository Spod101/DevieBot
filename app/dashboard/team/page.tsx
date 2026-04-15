'use client'

import { useState } from 'react'
import { useMembers } from '@/hooks/use-members'
import { memberColor, memberLabel, memberInitials } from '@/lib/member-utils'
import {
  Loader2, Trash2, Users, UserPlus, CalendarDays, X,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const COHORT_LABEL: Record<string, string> = {
  cohort4: 'Cohort 4',
  cohort3: 'Cohort 3',
}

const COHORT_ORDER = ['cohort4', 'cohort3']

export default function TeamPage() {
  const { members, loading, createMember, deleteMember } = useMembers()
  const [deletingId, setDeletingId]   = useState<number | null>(null)
  const [dialogOpen, setDialogOpen]   = useState(false)
  const [saving, setSaving]           = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: '', telegram_username: '', telegram_id: '', cohort: 'cohort4',
  })

  const now          = new Date()
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7); startOfWeek.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const newThisWeek  = members.filter(m => m.created_at && new Date(m.created_at) >= startOfWeek)
  const newThisMonth = members.filter(m => m.created_at && new Date(m.created_at) >= startOfMonth)

  // Group members by cohort in display order
  const grouped = COHORT_ORDER.reduce<Record<string, typeof members>>((acc, key) => {
    acc[key] = members.filter(m => (m.cohort ?? 'cohort4') === key)
    return acc
  }, {})
  const ungrouped = members.filter(m => m.cohort && !COHORT_ORDER.includes(m.cohort))

  async function handleDelete(id: string) {
    setDeletingId(Number(id))
    await deleteMember(id)
    setDeletingId(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    await createMember({
      name:              form.name,
      telegram_username: form.telegram_username || undefined,
      telegram_id:       form.telegram_id       || undefined,
      cohort:            form.cohort,
    })
    setSaving(false)
    setDialogOpen(false)
    setForm({ name: '', telegram_username: '', telegram_id: '', cohort: 'cohort4' })
  }

  function MemberTable({ items }: { items: typeof members }) {
    if (items.length === 0) return null
    return (
      <div
        className="rounded-2xl overflow-hidden overflow-x-auto"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        {/* Table header */}
        <div
          className="grid gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          style={{
            gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr auto',
            borderBottom: '1px solid var(--border)',
            background: 'var(--muted)',
            fontFamily: 'var(--font-jetbrains-mono)',
          }}
        >
          <span>Member</span>
          <span>Username</span>
          <span>Telegram ID</span>
          <span>Joined</span>
          <span />
        </div>

        {items.map((member, i) => {
          const color  = memberColor(member)
          const label  = memberLabel(member)
          const isLast = i === items.length - 1
          return (
            <div
              key={member.id}
              className="grid items-center gap-4 px-5 py-3 group transition-colors"
              style={{
                gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr auto',
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
                <span className="text-sm font-medium text-foreground truncate">{label}</span>
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
    )
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
            Members auto-register when they send a message in your Telegram group, or add them manually below.
          </p>
        </div>

        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
        >
          <UserPlus className="h-4 w-4" />
          Add Member
        </button>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Users,        label: 'Total Members',  value: members.length,       color: 'var(--primary)' },
            { icon: UserPlus,     label: 'New this week',  value: newThisWeek.length,   color: 'var(--devcon-sky)' },
            { icon: CalendarDays, label: 'New this month', value: newThisMonth.length,  color: '#10b981' },
          ].map(stat => (
            <div
              key={stat.label}
              className="glass-panel rounded-2xl p-5 flex items-center gap-4"
            >
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

      {/* ── Member tables grouped by cohort ────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
        </div>

      ) : members.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-48 text-center gap-3 rounded-2xl"
          style={{ border: '2px dashed var(--border)', background: 'var(--muted)' }}
        >
          <Users className="h-10 w-10 opacity-20" style={{ color: 'var(--primary)' }} />
          <div>
            <p className="text-sm font-medium text-muted-foreground">No members yet</p>
            <p className="text-xs mt-1 text-muted-foreground/60">
              Add members manually or have them send a message in your Telegram group.
            </p>
          </div>
        </div>

      ) : (
        <div className="space-y-8">
          {COHORT_ORDER.map(cohort => {
            const items = grouped[cohort]
            if (!items || items.length === 0) return null
            return (
              <div key={cohort} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-foreground">{COHORT_LABEL[cohort]}</h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--muted)',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  >
                    {items.length} member{items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <MemberTable items={items} />
              </div>
            )
          })}

          {/* Any members with an unknown cohort value */}
          {ungrouped.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">Other</h2>
              <MemberTable items={ungrouped} />
            </div>
          )}
        </div>
      )}

      {/* ── Add Member Dialog ───────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAdd} className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="member-name">
                Name <span style={{ color: '#ef4444' }}>*</span>
              </Label>
              <Input
                id="member-name"
                placeholder="e.g. Juan dela Cruz"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            {/* Cohort */}
            <div className="space-y-1.5">
              <Label>Cohort</Label>
              <div className="flex gap-2">
                {COHORT_ORDER.map(key => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setForm(f => ({ ...f, cohort: key }))}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: form.cohort === key ? 'var(--primary)' : 'var(--muted)',
                      color: form.cohort === key ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {COHORT_LABEL[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Telegram Username */}
            <div className="space-y-1.5">
              <Label htmlFor="member-username">Telegram Username <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  @
                </span>
                <Input
                  id="member-username"
                  className="pl-7"
                  placeholder="username"
                  value={form.telegram_username}
                  onChange={e => setForm(f => ({ ...f, telegram_username: e.target.value.replace(/^@/, '') }))}
                />
              </div>
            </div>

            {/* Telegram ID */}
            <div className="space-y-1.5">
              <Label htmlFor="member-tid">Telegram ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="member-tid"
                placeholder="e.g. 123456789"
                value={form.telegram_id}
                onChange={e => setForm(f => ({ ...f, telegram_id: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Add Member
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
