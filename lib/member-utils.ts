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

/** Display label — @username preferred, falls back to telegram_id */
export function memberLabel(member: Member): string {
  if (member.telegram_username) return `@${member.telegram_username}`
  if (member.telegram_id) return `#${member.telegram_id}`
  return `Member ${member.id}`
}

/** Short label for pill display (no @ prefix just the name) */
export function memberShortLabel(member: Member): string {
  return member.telegram_username ?? member.telegram_id ?? `${member.id}`
}
