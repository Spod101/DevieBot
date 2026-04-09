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
      .select('*, assignees:task_assignments(member:members(name))')
      .order('updated_at', { ascending: false }),
    supabase
      .from('code_camps')
      .select('*')
      .order('start_date', { ascending: true, nullsFirst: false }),
  ])

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

  // ── format a task line ─────────────────────────────────────────────────────
  function taskLine(t: any): string {
    const badge    = PRIORITY_BADGE[t.priority] ? ` [${PRIORITY_BADGE[t.priority]}]` : ''
    const assignee = t._assigneeNames.length ? ` · 👤 ${t._assigneeNames.join(', ')}` : ''
    const due      = t.due_date
      ? ` · 📅 due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : ''
    return `• ${t.title}${badge}${assignee}${due}`
  }

  // ─────────────────────────────────────────────────────────────────────────
  let msg = ''

  // Header
  msg += `📝 *DEVCON OPS — DAILY DSU*\n`
  msg += `${dateStr}\n`

  // KPI Snapshot
  msg += `\n📊 *KPI SNAPSHOT*\n`
  msg += `Code Camps: *${completedCamps}/${totalCamps} completed*\n`
  msg += `Days to Q2 deadline: *${daysToQ2} days*\n`
  msg += `Open Risks: *${openRisks}*\n`

  // Upcoming Camps
  if (upcomingCamps.length > 0) {
    msg += `\n📅 *UPCOMING CAMPS*\n`
    upcomingCamps.forEach(camp => {
      const icon = campIcon(camp, today)
      const date = formatCampDate(camp)
      msg += `${icon} *${camp.name}* — ${date}\n`
      const sub = [
        camp.venue          && `📍 ${camp.venue}`,
        camp.contact_person && `👤 ${camp.contact_person}`,
      ].filter(Boolean).join(' · ')
      if (sub) msg += `   ${sub}\n`
    })
  }

  // In Progress
  if (inProgress.length > 0) {
    msg += `\n🔄 *IN PROGRESS* (${inProgress.length})\n`
    inProgress.slice(0, 8).forEach(t => { msg += taskLine(t) + '\n' })
    if (inProgress.length > 8) msg += `_...and ${inProgress.length - 8} more_\n`
  }

  // In Review
  if (inReview.length > 0) {
    msg += `\n👀 *IN REVIEW* (${inReview.length})\n`
    inReview.slice(0, 5).forEach(t => { msg += taskLine(t) + '\n' })
  }

  // Blocked
  if (blockedTasks.length > 0) {
    msg += `\n🚧 *BLOCKED* (${blockedTasks.length})\n`
    blockedTasks.forEach(t => { msg += taskLine(t) + '\n' })
  }

  // Overdue
  if (overdue.length > 0) {
    msg += `\n⏰ *OVERDUE* (${overdue.length})\n`
    overdue.slice(0, 5).forEach(t => { msg += taskLine(t) + '\n' })
  }

  // Task Summary
  msg += `\n📋 *TASK SUMMARY*\n`
  msg += `✅ Done: ${doneTasks.length}  ·  🔄 In Progress: ${inProgress.length}  ·  👀 In Review: ${inReview.length}  ·  📝 To Do: ${todoTasks.length}  ·  🚧 Blocked: ${blockedTasks.length}\n`

  // Contextual next-action recommendation
  const firstBlocked   = blockedTasks[0]
  const firstOverdue   = overdue[0]
  const firstInProgress = inProgress[0]

  let nextCmd = ''
  let nextReason = ''

  if (firstBlocked) {
    const id = (firstBlocked.id as string).slice(0, 6)
    nextCmd   = `/update ${id} in_progress`
    nextReason = `unblock *${firstBlocked.title}*`
  } else if (firstOverdue) {
    const id = (firstOverdue.id as string).slice(0, 6)
    nextCmd   = `/done ${id}`
    nextReason = `close overdue task *${firstOverdue.title}*`
  } else if (firstInProgress) {
    const id = (firstInProgress.id as string).slice(0, 6)
    nextCmd   = `/done ${id}`
    nextReason = `finish *${firstInProgress.title}*`
  } else if (todoTasks.length > 0) {
    nextCmd   = `/tasks`
    nextReason = `pick up one of the ${todoTasks.length} queued tasks`
  } else {
    nextCmd   = `/addtask <title>`
    nextReason = `queue the next item`
  }

  msg += `\n💡 *Suggested next:* ${nextCmd}\n`
  msg += `_→ ${nextReason}_\n`
  msg += `_Send /help for all commands_`

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
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })
  const data = await res.json()
  if (!data.ok) return { ok: false, error: data.description }
  return { ok: true }
}
