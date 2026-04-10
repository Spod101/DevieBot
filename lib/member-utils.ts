import type { Member } from '@/types/database'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#a855f7',
]

/** Deterministic color derived from telegram_id or numeric id */
export function memberColor(member: Member): string {
  const seed = member.telegram_id ? parseInt(member.telegram_id, 10) : member.id
  return COLORS[Math.abs(seed) % COLORS.length]
}

/** Full display label — name preferred, falls back to @username, then ID */
export function memberLabel(member: Member): string {
  if (member.name)              return member.name
  if (member.telegram_username) return `@${member.telegram_username}`
  if (member.telegram_id)       return `#${member.telegram_id}`
  return `Member ${member.id}`
}

/** Short label for pill/badge display — first name only when possible */
export function memberShortLabel(member: Member): string {
  if (member.name) return member.name.split(' ')[0]   // first name only
  return member.telegram_username ?? member.telegram_id ?? `${member.id}`
}

/** Avatar initials (1-2 chars) */
export function memberInitials(member: Member): string {
  if (member.name) {
    const parts = member.name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return parts[0][0].toUpperCase()
  }
  const fallback = member.telegram_username?.[0] ?? member.telegram_id?.[0] ?? '?'
  return fallback.toUpperCase()
}
