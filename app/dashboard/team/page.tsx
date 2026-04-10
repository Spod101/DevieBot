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
    <div className="p-6 space-y-5 max-w-4xl">

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
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,  label: 'Total Members',    value: members.length,         color: 'var(--primary)' },
            { icon: AtSign, label: 'With @username',   value: withUsername.length,    color: '#60a5fa'        },
            { icon: UserX,  label: 'Username not set', value: withoutUsername.length, color: '#f97316'        },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl p-4"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="inline-flex p-2 rounded-xl mb-3"
                style={{ background: `color-mix(in srgb, ${stat.color} 12%, transparent)` }}
              >
                <stat.icon className="h-4 w-4" style={{ color: stat.color }} />
              </div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: stat.color, fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {stat.value}
              </div>
              <div className="text-xs mt-0.5 text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Member list ────────────────────────────────────────── */}
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
        <div className="space-y-2">
          {members.map(member => {
            const color = memberColor(member)
            const label = memberLabel(member)
            return (
              <div
                key={member.id}
                className="rounded-2xl px-4 py-3 flex items-center gap-4 group transition-all"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                {/* Avatar */}
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 select-none"
                  style={{
                    background: `color-mix(in srgb, ${color} 15%, transparent)`,
                    border: `1.5px solid color-mix(in srgb, ${color} 35%, transparent)`,
                    color,
                  }}
                >
                  {memberInitials(member)}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{label}</p>
                  <div
                    className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap"
                    style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                  >
                    {member.telegram_username && <span>@{member.telegram_username}</span>}
                    {member.telegram_id && (
                      <>
                        {member.telegram_username && <span className="opacity-30">·</span>}
                        <span>ID {member.telegram_id}</span>
                      </>
                    )}
                    {member.created_at && (
                      <>
                        <span className="opacity-30">·</span>
                        <span>Joined {format(new Date(member.created_at), 'MMM d, yyyy')}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* TG badge */}
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                  style={{
                    background: 'rgba(59,130,246,0.1)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59,130,246,0.2)',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  TG
                </span>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(String(member.id))}
                  disabled={deletingId === member.id}
                  className="h-8 w-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground"
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
