'use client'

import { useState } from 'react'
import { useMembers } from '@/hooks/use-members'
import { memberColor, memberLabel, memberInitials } from '@/lib/member-utils'
import { Loader2, Trash2, MessageCircle, Users, AtSign, UserX } from 'lucide-react'
import { format } from 'date-fns'

export default function TeamPage() {
  const { members, loading, deleteMember } = useMembers()
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(Number(id))
    await deleteMember(id)
    setDeletingId(null)
  }

  const withUsername    = members.filter(m => m.telegram_username)
  const withoutUsername = members.filter(m => !m.telegram_username)

  return (
    <div className="p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <div className="mono-tag mb-2">
          <span className="lime-dot" />
          <span>Members</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Team</h1>
        <p className="text-sm mt-1 text-muted-foreground">
          Members auto-register when they send a message in your Telegram group.
        </p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Users,  label: 'Total Members',    value: members.length,         color: 'var(--primary)' },
            { icon: AtSign, label: 'With @username',   value: withUsername.length,    color: 'var(--devcon-sky)' },
            { icon: UserX,  label: 'Username not set', value: withoutUsername.length, color: 'var(--devcon-orange)' },
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

      {/* ── Member table ───────────────────────────────────────── */}
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
              Anyone who sends a message in your Telegram group will appear here.
            </p>
          </div>
        </div>

      ) : (
        <div
          className="rounded-2xl overflow-hidden"
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

          {/* Rows */}
          {members.map((member, i) => {
            const color = memberColor(member)
            const label = memberLabel(member)
            const isLast = i === members.length - 1
            return (
              <div
                key={member.id}
                className="grid items-center gap-4 px-5 py-3 group transition-colors"
                style={{
                  gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr auto',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                {/* Member name + avatar */}
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

                {/* Joined date */}
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
      )}
    </div>
  )
}
