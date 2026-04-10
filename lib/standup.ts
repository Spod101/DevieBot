import { createServiceClient } from '@/lib/supabase/service'
import type { CodeCamp } from '@/types/database'

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

const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const PRIORITY_BADGE: Record<string, string> = {
  urgent: ' 🔴 URGENT',
  high:   ' 🟠 HIGH',
  medium: '',
  low:    '',
}

export async function generateStandupMessage(): Promise<string> {
  const supabase = createServiceClient()

  const [tasksRes, campsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, task_number, title, status, priority, due_date, assigned_to, camp_id, updated_at')
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

  const dateStr = today.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  function taskLine(t: any): string {
    const code     = t.task_number ? `<code>T-${String(t.task_number).padStart(3, '0')}</code> ` : ''
    const title    = h(t.title)
    const badge    = PRIORITY_BADGE[t.priority] ?? ''
    const assignee = t._assignee ? ` — ${h(t._assignee)}` : ''
    const due      = t.due_date
      ? ` · 📅 ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : ''
    return `▸ ${code}${title}${badge}${assignee}${due}`
  }

  function section(icon: string, label: string, items: any[], limit = 10): string {
    if (items.length === 0) return ''
    let s = `\n\n${icon} <b>${label}</b> <i>(${items.length})</i>\n`
    s += `${DIV}\n`
    items.slice(0, limit).forEach(t => { s += taskLine(t) + '\n' })
    if (items.length > limit) s += `<i>...and ${items.length - limit} more</i>\n`
    return s
  }

  let msg = ''

  msg += `📋 <b>DEVCON COHORT 4 — Daily Stand Up</b>\n`
  msg += `<i>${h(dateStr)}</i>\n`

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

  msg += section('🔄', 'IN PROGRESS', inProgress, 10)
  msg += section('👀', 'IN REVIEW',   inReview,   8)
  msg += section('🚧', 'BLOCKED',     blocked,    10)
  msg += section('⏰', 'OVERDUE',     overdue,    5)

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

export interface SendOptions {
  replyToMessageId?: number
}

export async function sendTelegramMessage(
  text: string,
  options: SendOptions = {}
): Promise<{ ok: boolean; error?: string }> {
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
    return sendMessage(data.bot_token, data.chat_id, text, options)
  }

  return sendMessage(token, chatId, text, options)
}

async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  options: SendOptions = {}
) {
  const payload: Record<string, unknown> = {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    allow_sending_without_reply: true,
  }
  if (options.replyToMessageId) {
    payload.reply_to_message_id = options.replyToMessageId
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  const data = await res.json()
  if (!data.ok) return { ok: false, error: data.description }
  return { ok: true }
}
