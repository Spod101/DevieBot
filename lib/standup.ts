import { createServiceClient } from '@/lib/supabase/service'
import type { Task, CodeCamp } from '@/types/database'

// ─── helpers ────────────────────────────────────────────────────────────────

const DIV = '─────────────────────'

function campIcon(camp: CodeCamp, today: Date): string {
  if (camp.status === 'completed') return '✅'
  if (camp.status === 'paused')    return '⏸'
  if (camp.status === 'archived')  return '📦'
  if (!camp.start_date)            return '🚀'
  const daysAway = Math.ceil(
    (new Date(camp.start_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysAway <= 14) return '🟢'
  if (daysAway <= 60) return '📌'
  return '🚀'
}

function formatCampDate(camp: CodeCamp): string {
  if (!camp.start_date) return 'TBC'
  return new Date(camp.start_date).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// Escape HTML special chars so task titles/usernames never break the parser
const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const PRIORITY_BADGE: Record<string, string> = {
  urgent: ' 🔴 URGENT',
  high:   ' 🟠 HIGH',
  medium: '',
  low:    '',
}

// ─── main generator ─────────────────────────────────────────────────────────

export async function generateStandupMessage(): Promise<string> {
  const supabase = createServiceClient()

  const [tasksRes, campsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, priority, due_date, assigned_to, camp_id, updated_at')
      .order('priority', { ascending: false }),
    supabase
      .from('code_camps')
      .select('*')
      .order('start_date', { ascending: true }),
  ])

  if (tasksRes.error) console.error('[standup] tasks query error:', tasksRes.error.message)
  if (campsRes.error) console.error('[standup] camps query error:', campsRes.error.message)

  const rawTasks: any[] = tasksRes.data || []
  const allCamps: CodeCamp[] = campsRes.data || []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tasks = rawTasks.map(t => ({
    ...t,
    _assignee: t.assigned_to ? `@${t.assigned_to}` : null,
  }))

  // ── task buckets ───────────────────────────────────────────────────────────
  const inProgress  = tasks.filter(t => t.status === 'in_progress')
  const inReview    = tasks.filter(t => t.status === 'in_review')
  const blocked     = tasks.filter(t => t.status === 'blocked')
  const overdue     = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < today && t.status !== 'done'
  )
  const doneTasks   = tasks.filter(t => t.status === 'done')
  const todoTasks   = tasks.filter(t => t.status === 'todo')
  const activeTasks = tasks.filter(t => t.status !== 'done')

  const upcomingCamps = allCamps.filter(c => c.status === 'active' || c.status === 'paused')
  const completedCamps = allCamps.filter(c => c.status === 'completed').length

  // ── date header ─────────────────────────────────────────────────────────────
  const dateStr = today.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  // ── task line formatter ──────────────────────────────────────────────────────
  function taskLine(t: any): string {
    const title    = h(t.title)
    const badge    = PRIORITY_BADGE[t.priority] ?? ''
    const assignee = t._assignee ? ` — ${h(t._assignee)}` : ''
    const due      = t.due_date
      ? ` · 📅 ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : ''
    return `▸ ${title}${badge}${assignee}${due}`
  }

  // ── section builder ──────────────────────────────────────────────────────────
  function section(icon: string, label: string, items: any[], limit = 10): string {
    if (items.length === 0) return ''
    let s = `\n\n${icon} <b>${label}</b> <i>(${items.length})</i>\n`
    s += `${DIV}\n`
    items.slice(0, limit).forEach(t => { s += taskLine(t) + '\n' })
    if (items.length > limit) s += `<i>...and ${items.length - limit} more</i>\n`
    return s
  }

  // ─────────────────────────────────────────────────────────────────────────
  let msg = ''

  // ── Header ────────────────────────────────────────────────────────────────
  msg += `📋 <b>DEVCON COHORT 4 — Daily Stand Up</b>\n`
  msg += `<i>${h(dateStr)}</i>\n`

  // ── KPI Snapshot (task-focused) ───────────────────────────────────────────
  msg += `\n📊 <b>KPI SNAPSHOT</b>\n`
  msg += `${DIV}\n`
  msg += `📌 Active Tasks: <b>${activeTasks.length}</b>\n`
  msg += `✅ Done: <b>${doneTasks.length}</b>\n`
  msg += `🚧 Blocked: <b>${blocked.length}</b>\n`
  msg += `⏰ Overdue: <b>${overdue.length}</b>\n`
  if (allCamps.length > 0) {
    msg += `🏕️ Camps: <b>${upcomingCamps.length} active</b>`
    if (completedCamps > 0) msg += `, ${completedCamps} completed`
    msg += '\n'
  }

  // ── Upcoming Camps (only if any) ──────────────────────────────────────────
  if (upcomingCamps.length > 0) {
    msg += `\n\n📅 <b>UPCOMING CAMPS</b>\n`
    msg += `${DIV}\n`
    upcomingCamps.forEach(camp => {
      const icon = campIcon(camp, today)
      const date = formatCampDate(camp)
      msg += `${icon} <b>${h(camp.name)}</b> — ${h(date)}\n`
      const sub = [
        camp.venue          && `📍 ${h(camp.venue)}`,
        camp.contact_person && `👤 ${h(camp.contact_person)}`,
      ].filter(Boolean).join(' · ')
      if (sub) msg += `   ${sub}\n`
    })
  }

  // ── Task Sections (only non-empty ones shown) ─────────────────────────────
  msg += section('🔄', 'IN PROGRESS', inProgress, 10)
  msg += section('👀', 'IN REVIEW',   inReview,   8)
  msg += section('🚧', 'BLOCKED',     blocked,    10)
  msg += section('⏰', 'OVERDUE',     overdue,    5)

  // ── Task Summary ──────────────────────────────────────────────────────────
  msg += `\n\n📋 <b>TASK SUMMARY</b>\n`
  msg += `${DIV}\n`
  msg += `✅ Done: ${doneTasks.length}\n`
  msg += `🔄 In Progress: ${inProgress.length}\n`
  msg += `👀 In Review: ${inReview.length}\n`
  msg += `📝 To Do: ${todoTasks.length}\n`
  msg += `🚧 Blocked: ${blocked.length}\n`
  msg += `⏰ Overdue: ${overdue.length}`

  return msg
}

// ─── send helpers ────────────────────────────────────────────────────────────

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('telegram_config')
      .select('bot_token, chat_id')
      .limit(1)
      .single()
    if (!data?.bot_token || !data?.chat_id)
      return { ok: false, error: 'Telegram not configured' }
    return sendMessage(data.bot_token, data.chat_id, text)
  }

  return sendMessage(token, chatId, text)
}

async function sendMessage(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  const data = await res.json()
  if (!data.ok) return { ok: false, error: data.description }
  return { ok: true }
}
