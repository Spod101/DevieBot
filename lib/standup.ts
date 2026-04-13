import { createServiceClient } from '@/lib/supabase/service'

const DIV = '─────────────────────'

const PRIORITY_BADGE: Record<string, string> = {
  urgent: ' 🔴 URGENT',
  high:   ' 🟠 HIGH',
  medium: '',
  low:    '',
}

export async function generateStandupMessage(): Promise<string> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('tasks')
    .select('id, task_number, title, status, priority, due_date, assigned_to, updated_at')
    .order('priority', { ascending: false })

  if (error) console.error('[standup] tasks query error:', error.message)

  const rawTasks: any[] = data || []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tasks = rawTasks.map(t => ({
    ...t,
    _assignee: t.assigned_to ? `@${t.assigned_to}` : null,
  }))

  const backlogTasks = tasks.filter(t => t.status === 'backlog')
  const todoTasks    = tasks.filter(t => t.status === 'todo')
  const inProgress   = tasks.filter(t => t.status === 'in_progress')
  const inReview     = tasks.filter(t => t.status === 'in_review')
  const blocked      = tasks.filter(t => t.status === 'blocked')
  const doneTasks    = tasks.filter(t => t.status === 'done')
  const overdue      = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < today && t.status !== 'done'
  )
  const activeTasks  = tasks.filter(t => t.status !== 'done')

  const dateStr = today.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  function taskLine(t: any): string {
    const code     = t.task_number ? `<code>T-${String(t.task_number).padStart(3, '0')}</code> ` : ''
    const title    = h(t.title)
    const badge    = PRIORITY_BADGE[t.priority] ?? ''
    const assignee = t._assignee ? ` — ${h(t._assignee)}` : ''
    const due      = t.due_date
      ? ` · ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
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

  msg += section('⏰', 'OVERDUE',      overdue,      5)
  msg += section('🚧', 'BLOCKED',      blocked,     10)
  msg += section('🔄', 'IN PROGRESS',  inProgress,  10)
  msg += section('👀', 'IN REVIEW',    inReview,     8)
  msg += section('📝', 'TO DO',        todoTasks,   10)
  msg += section('📦', 'BACKLOG',      backlogTasks, 10)
  msg += section('✅', 'DONE',         doneTasks,   10)

  msg += `\n\n📋 <b>TASK SUMMARY</b>\n`
  msg += `${DIV}\n`
  msg += `✅ Done: ${doneTasks.length}\n`
  msg += `🔄 In Progress: ${inProgress.length}\n`
  msg += `👀 In Review: ${inReview.length}\n`
  msg += `📝 To Do: ${todoTasks.length}\n`
  msg += `📦 Backlog: ${backlogTasks.length}\n`
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
  const envToken = process.env.TELEGRAM_BOT_TOKEN
  const envChatId = process.env.TELEGRAM_CHAT_ID

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('telegram_config')
    .select('bot_token, chat_id')
    .limit(1)
    .single()

  // Prefer dashboard-saved values; fall back to env vars for legacy setups.
  const token = data?.bot_token?.trim() || envToken
  const chatId = data?.chat_id?.trim() || envChatId

  if (!token || !chatId) {
    return { ok: false, error: 'Telegram not configured' }
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
