import { createServiceClient } from '@/lib/supabase/service'
import type { Task, CodeCamp } from '@/types/database'

// ─── helpers ────────────────────────────────────────────────────────────────

function getQ2Deadline(from: Date): number {
  const q2End = new Date(from.getFullYear(), 5, 30) // June 30
  if (q2End < from) q2End.setFullYear(from.getFullYear() + 1)
  return Math.ceil((q2End.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

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


const PRIORITY_BADGE: Record<string, string> = {
  urgent: '🔴 URGENT',
  high:   '🟠 HIGH',
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
      .order('updated_at', { ascending: false }),
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

  // assigned_to is a plain text field (telegram_username or telegram_id)
  const tasks = rawTasks.map(t => ({
    ...t,
    _assigneeNames: t.assigned_to ? [`@${t.assigned_to}`] : [],
  }))

  // ── KPI metrics ────────────────────────────────────────────────────────────
  const completedCamps = allCamps.filter(c => c.status === 'completed').length
  const totalCamps     = allCamps.length
  const blockedTasks   = tasks.filter(t => t.status === 'blocked')
  const urgentActive   = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done')
  const openRisks      = new Set([...blockedTasks, ...urgentActive].map(t => t.id)).size
  const daysToQ2       = getQ2Deadline(today)

  // ── task buckets ───────────────────────────────────────────────────────────
  const inProgress  = tasks.filter(t => t.status === 'in_progress')
  const inReview    = tasks.filter(t => t.status === 'in_review')
  const overdue     = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < today && t.status !== 'done'
  )
  const doneTasks   = tasks.filter(t => t.status === 'done')
  const todoTasks   = tasks.filter(t => t.status === 'todo')

  const upcomingCamps = allCamps.filter(c => c.status === 'active' || c.status === 'paused')

  // ── date header ────────────────────────────────────────────────────────────
  const dateStr = today.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  // ── format a task line (HTML-safe) ────────────────────────────────────────
  function taskLine(t: any): string {
    const badge    = PRIORITY_BADGE[t.priority] ? ` [${PRIORITY_BADGE[t.priority]}]` : ''
    const assignee = t._assigneeNames.length
      ? ` · 👤 ${t._assigneeNames.map((n: string) => n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join(', ')}`
      : ''
    const due      = t.due_date
      ? ` · 📅 due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : ''
    const title = t.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `• ${title}${badge}${assignee}${due}`
  }

  // Escape HTML special chars in dynamic content so task titles / usernames
  // never break Telegram's HTML parser
  const h = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // ─────────────────────────────────────────────────────────────────────────
  let msg = ''

  // Header
  msg += `📝 <b>DEVCON OPS — DAILY DSU</b>\n`
  msg += `${h(dateStr)}\n`

  // KPI Snapshot
  msg += `\n📊 <b>KPI SNAPSHOT</b>\n`
  msg += `Code Camps: <b>${completedCamps}/${totalCamps} completed</b>\n`
  msg += `Days to Q2 deadline: <b>${daysToQ2} days</b>\n`
  msg += `Open Risks: <b>${openRisks}</b>\n`

  // Upcoming Camps
  if (upcomingCamps.length > 0) {
    msg += `\n📅 <b>UPCOMING CAMPS</b>\n`
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

  // In Progress
  if (inProgress.length > 0) {
    msg += `\n🔄 <b>IN PROGRESS</b> (${inProgress.length})\n`
    inProgress.slice(0, 8).forEach(t => { msg += taskLine(t) + '\n' })
    if (inProgress.length > 8) msg += `<i>...and ${inProgress.length - 8} more</i>\n`
  }

  // In Review
  if (inReview.length > 0) {
    msg += `\n👀 <b>IN REVIEW</b> (${inReview.length})\n`
    inReview.slice(0, 5).forEach(t => { msg += taskLine(t) + '\n' })
  }

  // Blocked
  if (blockedTasks.length > 0) {
    msg += `\n🚧 <b>BLOCKED</b> (${blockedTasks.length})\n`
    blockedTasks.forEach(t => { msg += taskLine(t) + '\n' })
  }

  // Overdue
  if (overdue.length > 0) {
    msg += `\n⏰ <b>OVERDUE</b> (${overdue.length})\n`
    overdue.slice(0, 5).forEach(t => { msg += taskLine(t) + '\n' })
  }

  // Task Summary
  msg += `\n📋 <b>TASK SUMMARY</b>\n`
  msg += `✅ Done: ${doneTasks.length}  ·  🔄 In Progress: ${inProgress.length}  ·  👀 In Review: ${inReview.length}  ·  📝 To Do: ${todoTasks.length}  ·  🚧 Blocked: ${blockedTasks.length}\n`

  // Contextual next-action recommendation
  const firstBlocked    = blockedTasks[0]
  const firstOverdue    = overdue[0]
  const firstInProgress = inProgress[0]

  let nextCmd = ''
  let nextReason = ''

  if (firstBlocked) {
    const id = (firstBlocked.id as string).slice(0, 6)
    nextCmd    = `/update ${id} in progress`
    nextReason = `unblock <b>${h(firstBlocked.title)}</b>`
  } else if (firstOverdue) {
    const id = (firstOverdue.id as string).slice(0, 6)
    nextCmd    = `/done ${id}`
    nextReason = `close overdue task <b>${h(firstOverdue.title)}</b>`
  } else if (firstInProgress) {
    const id = (firstInProgress.id as string).slice(0, 6)
    nextCmd    = `/done ${id}`
    nextReason = `finish <b>${h(firstInProgress.title)}</b>`
  } else if (todoTasks.length > 0) {
    nextCmd    = `/tasks`
    nextReason = `pick up one of the ${todoTasks.length} queued tasks`
  } else {
    nextCmd    = `/addtask &lt;title&gt;`
    nextReason = `queue the next item`
  }

  msg += `\n💡 <b>Suggested next:</b> <code>${nextCmd}</code>\n`
  msg += `<i>→ ${nextReason}</i>\n`
  msg += `<i>Send /help for all commands</i>`

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
