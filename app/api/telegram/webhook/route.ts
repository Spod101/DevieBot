import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateStandupMessage, sendTelegramMessage } from '@/lib/standup'
import { parseBulkTasks, parseMessage, parseStatus, cleanTaskTitle } from '@/lib/nlp'
import type { TaskStatus } from '@/types/database'

/** Returns a due date 7 days from today (ISO YYYY-MM-DD) */
function defaultDueDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().split('T')[0]
}

/** Validates an ISO date string; returns it or null */
function validDate(d: string | null | undefined): string | null {
  if (!d) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

// Escape HTML special characters for Telegram HTML parse mode
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Priority dot emoji */
const PRIORITY_EMOJI: Record<string, string> = {
  urgent: '🔴', high: '🟠', medium: '🔵', low: '⚪',
}

/** Formatted single-task creation reply */
function taskAddedMsg(task: {
  title: string
  task_number: number | null
  id: string
  priority: string
  due_date?: string | null
  assigned_to?: string | null
  camp_id?: string | null
}, campName?: string | null): string {
  const dot   = PRIORITY_EMOJI[task.priority] ?? '🔵'
  const pri   = task.priority.charAt(0).toUpperCase() + task.priority.slice(1)
  const where = campName ? ` · ${esc(campName)}` : ''
  const code  = task.task_number ? `t${task.task_number}` : task.id.slice(0, 6)

  const lines: string[] = [
    `${dot} Task added · ${pri}${where}:`,
    `<b>${esc(task.title)}</b>`,
  ]
  if (task.assigned_to) lines.push(`👤 Assigned to: ${esc(task.assigned_to)}`)
  if (task.due_date)    lines.push(`📅 Due: ${new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`)
  lines.push(`🪪 ID: <code>${code}</code>`)
  lines.push('')
  lines.push(`<i>Refresh the dashboard to see your changes.</i>`)

  return lines.join('\n')
}


// ── Telegram API helpers ──────────────────────────────────────────────────────

async function getToken(supabase: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const { data } = await supabase.from('telegram_config').select('bot_token').limit(1).single()
  return data?.bot_token?.trim() || process.env.TELEGRAM_BOT_TOKEN || null
}

async function sendWithKeyboard(
  token: string, chatId: number, text: string,
  keyboard: object, replyToMessageId?: number,
) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, text, parse_mode: 'HTML',
      reply_markup: keyboard,
      reply_to_message_id: replyToMessageId,
      allow_sending_without_reply: true,
    }),
  })
}

async function editWithKeyboard(
  token: string, chatId: number, messageId: number,
  text: string, keyboard: object,
) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, message_id: messageId,
      text, parse_mode: 'HTML', reply_markup: keyboard,
    }),
  })
}

async function answerCbq(token: string, id: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id }),
  })
}

// ── /tasks pagination helpers ─────────────────────────────────────────────────

const TASK_STATUS_EMOJI: Record<string, string> = {
  backlog: '📦', todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧',
}
const TASK_STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress',
  in_review: 'In Review', blocked: 'Blocked',
}
const TASK_STATUS_ORDER = ['blocked', 'in_progress', 'in_review', 'todo', 'backlog']
const COHORT_LABEL: Record<string, string> = { all: 'All', cohort4: 'Cohort 4', cohort3: 'Cohort 3' }

type TaskPage = {
  name: string
  cohort: string
  byStatus: Record<string, string[]>
}

async function fetchTaskPages(
  cohortFilter: string,
  assigneeFilter: string | null,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<TaskPage[]> {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, task_number, title, status, priority, assigned_to')
    .neq('status', 'done')
    .order('priority', { ascending: false })
    .limit(200)

  const { data: memberRows } = await supabase
    .from('members')
    .select('name, telegram_username, cohort')

  // Build lookup: assigneeKey → { display, cohort }
  const memberMap = new Map<string, { display: string; cohort: string }>()
  for (const m of (memberRows ?? [])) {
    const display = m.name ?? m.telegram_username ?? ''
    const cohort  = m.cohort ?? 'cohort4'
    if (m.name)              memberMap.set(assigneeKey(m.name),              { display, cohort })
    if (m.telegram_username) memberMap.set(assigneeKey(m.telegram_username), { display, cohort })
  }

  // Group tasks by member → status
  const memberBuckets = new Map<string, TaskPage>()

  for (const t of (tasks ?? [])) {
    const key    = assigneeKey(t.assigned_to ?? '')
    const info   = t.assigned_to ? memberMap.get(key) : null
    const cohort = info?.cohort ?? 'cohort4'
    const name   = info?.display ?? t.assigned_to ?? '(Unassigned)'

    // Apply filters
    if (cohortFilter !== 'all' && cohort !== cohortFilter) continue
    if (assigneeFilter && assigneeKey(name) !== assigneeFilter) continue

    const code = t.task_number ? `T-${String(t.task_number).padStart(3, '0')}` : t.id.slice(0, 6)
    const line = `  • <code>${code}</code> ${esc(t.title)}`

    if (!memberBuckets.has(name)) memberBuckets.set(name, { name, cohort, byStatus: {} })
    const bucket = memberBuckets.get(name)!
    if (!bucket.byStatus[t.status]) bucket.byStatus[t.status] = []
    bucket.byStatus[t.status].push(line)
  }

  // Sort: cohort4 first, then cohort3, then alphabetically within each cohort
  return [...memberBuckets.values()].sort((a, b) => {
    if (a.cohort !== b.cohort) return a.cohort < b.cohort ? -1 : 1   // cohort4 < cohort3 alphabetically
    return a.name.localeCompare(b.name)
  })
}

function buildTasksPage(pages: TaskPage[], page: number, cohortFilter: string): { text: string; keyboard: object } {
  const total   = pages.length
  const current = pages[Math.max(0, Math.min(page, total - 1))]

  const cohortDisplay = cohortFilter === 'all' ? '' : ` — ${COHORT_LABEL[cohortFilter]}`
  let text = `📋 <b>Tasks${cohortDisplay}</b>\n`
  text += `👤 <b>${esc(current.name)}</b>  <i>(${page + 1} / ${total})</i>\n`
  text += `─────────────────────\n`

  let hasAny = false
  for (const status of TASK_STATUS_ORDER) {
    const lines = current.byStatus[status]
    if (!lines?.length) continue
    hasAny = true
    text += `\n${TASK_STATUS_EMOJI[status]} <i>${TASK_STATUS_LABEL[status]}</i>\n`
    text += lines.join('\n') + '\n'
  }
  if (!hasAny) text += '\n<i>No active tasks.</i>\n'

  // Filter row
  const filterRow = (['all', 'cohort4', 'cohort3'] as const).map(f => ({
    text: f === cohortFilter ? `· ${COHORT_LABEL[f]}` : COHORT_LABEL[f],
    callback_data: `tasks|${f}|0`,
  }))

  // Nav row — only show if more than 1 page
  const keyboard: { inline_keyboard: object[][] } = { inline_keyboard: [filterRow] }
  if (total > 1) {
    const prev = page > 0 ? page - 1 : total - 1
    const next = page < total - 1 ? page + 1 : 0
    keyboard.inline_keyboard.push([
      { text: '◀ Prev', callback_data: `tasks|${cohortFilter}|${prev}` },
      { text: `${page + 1} / ${total}`, callback_data: `tasks|${cohortFilter}|${page}` },
      { text: 'Next ▶', callback_data: `tasks|${cohortFilter}|${next}` },
    ])
  }

  return { text, keyboard }
}

const VALID_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent']

const STATUS_ALIASES: Record<string, TaskStatus> = {
  backlog: 'backlog',
  todo: 'todo',
  'in-progress': 'in_progress',
  inprogress: 'in_progress',
  progress: 'in_progress',
  review: 'in_review',
  'in-review': 'in_review',
  blocked: 'blocked',
  done: 'done',
  complete: 'done',
  finished: 'done',
}

// Accept "T-001", "t001", "1" (task_number) or a UUID prefix
async function findTaskByPrefix(input: string, supabase: ReturnType<typeof createServiceClient>) {
  const clean = input.trim()

  // Match T-001, T001, t-1, t1, or bare number
  const codeMatch = clean.match(/^t-?0*(\d+)$/i) ?? clean.match(/^0*(\d+)$/)
  if (codeMatch) {
    const num = parseInt(codeMatch[1], 10)
    const { data } = await supabase
      .from('tasks').select('id, title, task_number').eq('task_number', num).maybeSingle()
    return data ?? null
  }

  // Fall back to UUID prefix (client-side)
  const { data } = await supabase.from('tasks').select('id, title, task_number').limit(500)
  return (data ?? []).find((t: any) => t.id.startsWith(clean.toLowerCase())) ?? null
}

// Find a task by ID/number (fast path) or title keyword (fallback).
// Returns up to 5 title matches so callers can handle ambiguity.
async function findTaskByRef(
  input: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<{ tasks: { id: string; title: string; task_number: number | null; status: string }[]; ambiguous: boolean }> {
  // Fast path: numeric / T-XXX / UUID prefix — no extra DB call
  const byId = await findTaskByPrefix(input, supabase)
  if (byId) return { tasks: [{ ...byId, status: '' }], ambiguous: false }

  // Title keyword search across non-done tasks
  const { data } = await supabase
    .from('tasks')
    .select('id, title, task_number, status')
    .ilike('title', `%${input}%`)
    .neq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(5)

  const tasks = (data ?? []) as { id: string; title: string; task_number: number | null; status: string }[]
  return { tasks, ambiguous: tasks.length > 1 }
}

// Format a task as a short disambiguation line: "23 · Fix login bug (in_progress)"
function taskRefLine(t: { title: string; task_number: number | null; status: string }): string {
  const num = t.task_number ?? '—'
  const status = t.status ? ` (${t.status.replace(/_/g, ' ')})` : ''
  return `• <b>${num}</b> · ${esc(t.title)}${status}`
}

// Resolve a @username to the member's display name (stored in assigned_to)
// Falls back to the raw username if no member found
async function resolveName(username: string, supabase: ReturnType<typeof createServiceClient>): Promise<string> {
  const { data } = await supabase
    .from('members')
    .select('name, telegram_username, telegram_id')
    .ilike('telegram_username', username)
    .maybeSingle()
  return data?.name ?? data?.telegram_username ?? username
}

function assigneeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/^@+/, '')
}

async function resolveAssigneeAliases(
  username: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<{ label: string; aliases: string[] }> {
  const { data } = await supabase
    .from('members')
    .select('name, telegram_username')
    .ilike('telegram_username', username)
    .maybeSingle()

  const aliases = new Set<string>()
  aliases.add(assigneeKey(username))
  aliases.add(assigneeKey(`@${username}`))
  if (data?.telegram_username) {
    aliases.add(assigneeKey(data.telegram_username))
    aliases.add(assigneeKey(`@${data.telegram_username}`))
  }
  if (data?.name) aliases.add(assigneeKey(data.name))

  return {
    label: data?.name ?? data?.telegram_username ?? username,
    aliases: [...aliases].filter(Boolean),
  }
}

// Detect a member name embedded at the end of a task title (no @ used).
// Tries the last 2 words as a full name first, then the last single word as
// a first-name match (exact or "FirstName LastName" prefix).
// Returns the stripped title + resolved assignee, or the original text + null.
async function resolveAssigneeByName(
  text: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<{ title: string; assignee: string | null }> {
  const words = text.trim().split(/\s+/)
  // Need at least 2 words so stripping a name still leaves a non-empty title
  if (words.length < 2) return { title: text.trim(), assignee: null }

  // ── Try last 2 words as a full name (e.g. "Juan dela Cruz") ──────────
  if (words.length >= 3) {
    const candidate = words.slice(-2).join(' ')
    const { data } = await supabase
      .from('members').select('name').ilike('name', candidate).maybeSingle()
    if (data?.name) {
      return { title: words.slice(0, -2).join(' ').trim(), assignee: data.name }
    }
  }

  // ── Try last word as a first name (exact) ────────────────────────────
  const lastWord = words[words.length - 1]
  const remainingTitle = words.slice(0, -1).join(' ').trim()
  if (!remainingTitle) return { title: text.trim(), assignee: null }

  const { data: exact } = await supabase
    .from('members').select('name').ilike('name', lastWord).maybeSingle()
  if (exact?.name) return { title: remainingTitle, assignee: exact.name }

  // ── Try last word as first name with a last name stored ("David Reyes") ─
  const { data: prefix } = await supabase
    .from('members').select('name').ilike('name', `${lastWord} %`).limit(1).maybeSingle()
  if (prefix?.name) return { title: remainingTitle, assignee: prefix.name }

  return { title: text.trim(), assignee: null }
}

// Auto-register (or update) a member from their Telegram profile
async function syncMember(from: {
  id: number
  first_name: string
  last_name?: string
  username?: string
}, supabase: ReturnType<typeof createServiceClient>) {
  try {
    const telegramId = String(from.id)
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || null
    const username = from.username ?? null

    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle()

    if (existing) {
      // Update name/username in case they changed their Telegram profile
      await supabase
        .from('members')
        .update({ name, telegram_username: username })
        .eq('telegram_id', telegramId)
      return
    }

    const { error } = await supabase.from('members').insert({
      telegram_id: telegramId,
      telegram_username: username,
      name,
      cohort: 'cohort4',   // default for auto-registered members; update manually if needed
    })

    if (error) {
      console.error('[syncMember] insert failed:', error.message, error.details)
    } else {
      console.log(`[syncMember] registered ${name ?? username ?? telegramId}`)
    }
  } catch (err: any) {
    console.error('[syncMember] unexpected error:', err?.message ?? err)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createServiceClient()

    // ── Register member on group entry ────────────────────────────────
    // Telegram sends chat_member when someone joins a group/channel
    const memberUpdate = body?.chat_member ?? body?.my_chat_member
    if (memberUpdate) {
      const newMember = memberUpdate.new_chat_member
      if (newMember && !newMember.user?.is_bot && newMember.status !== 'left' && newMember.status !== 'kicked') {
        await syncMember(newMember.user, supabase)
      }
      return NextResponse.json({ ok: true })
    }

    // ── Inline keyboard callback (tasks pagination) ──────────────────────
    const cbq = body?.callback_query
    if (cbq) {
      const data: string = cbq.data ?? ''
      const chatId       = cbq.message?.chat?.id as number
      const msgId        = cbq.message?.message_id as number
      const token        = await getToken(supabase)

      if (token && data.startsWith('tasks|') && chatId && msgId) {
        const [, cohortFilter, pageStr] = data.split('|')
        const page = parseInt(pageStr, 10)
        if (!isNaN(page)) {
          const pages = await fetchTaskPages(cohortFilter, null, supabase)
          if (pages.length === 0) {
            await answerCbq(token, cbq.id)
            return NextResponse.json({ ok: true })
          }
          const safePage = Math.max(0, Math.min(page, pages.length - 1))
          const { text, keyboard } = buildTasksPage(pages, safePage, cohortFilter)
          await editWithKeyboard(token, chatId, msgId, text, keyboard)
        }
      }

      if (token) await answerCbq(token, cbq.id)
      return NextResponse.json({ ok: true })
    }

    const message = body?.message
    if (!message?.text) return NextResponse.json({ ok: true })

    const text      = (message.text as string).trim()
    const messageId = message.message_id as number   // unique per message in this chat
    const senderId  = message.from?.id as number     // unique per user

    // ── Per-request reply closure ─────────────────────────────────────────
    // Captures messageId so every response is threaded to the exact message
    // that triggered it. Concurrent requests each get their own closure —
    // no shared state, no crosstalk between Person 1 and Person 2.
    const reply = (text: string) =>
      sendTelegramMessage(text, { replyToMessageId: messageId })

    console.log(`[webhook] msg=${messageId} from=${senderId} cmd="${text.split(' ')[0]}"`)

    // Auto-register sender as a member
    if (message.from && !message.from.is_bot) {
      await syncMember(message.from, supabase)
    }

    // Strip bot username suffix only when directly attached to a command (e.g. /help@MyBot → /help)
    const normalized = text.replace(/^(\/\w+)@\w+/, '$1').trim()
    const [cmd, ...args] = normalized.split(/\s+/)
    const rest = args.join(' ').trim()
    // Preserve original newlines for multiline body (e.g. bulk task text)
    const rawRest = normalized.replace(/^\/\w+\s*/, '')

    // ── /help or /start ───────────────────────────────────────────────
    if (cmd === '/help' || cmd === '/start') {
      await reply(
        `🤖 <b>Devie — Available Commands</b>\n\n` +
        `📋 <b>View</b>\n` +
        `/tasks — browse tasks by member (paginated)\n` +
        `/tasks cohort4 — filter by Cohort 4\n` +
        `/tasks cohort3 — filter by Cohort 3\n` +
        `/tasks @name — filter by member\n` +
        `/deadlines — show upcoming deadlines\n` +
        `/standup — send the standup report\n\n` +
        `➕ <b>Create</b>\n` +
        `/addtask &lt;title&gt; — add a task (7-day deadline by default)\n` +
        `/addtask &lt;title&gt; by Friday — add a task with a specific deadline\n` +
        `/addtask &lt;title&gt; @username — add a task and assign it to someone\n\n` +
        `✏️ <b>Update</b>\n` +
        `/done &lt;number or keyword&gt; — e.g. /done 23 or /done login bug\n` +
        `/update &lt;number or keyword&gt; &lt;status&gt; — e.g. /update login in review\n` +
        `<i>Statuses: backlog · todo · in progress · in review · blocked · done</i>`
      )
      return NextResponse.json({ ok: true })
    }

    // ── /deadlines ────────────────────────────────────────────────────
    if (cmd === '/deadlines') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]
      const in7days = new Date(today)
      in7days.setDate(today.getDate() + 7)
      const in7Str = in7days.toISOString().split('T')[0]

      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, task_number, title, due_date, priority, assigned_to, status')
        .lte('due_date', in7Str)
        .neq('status', 'done')
        .order('due_date', { ascending: true })
        .limit(20)

      if (!tasks || tasks.length === 0) {
        await reply('📅 No upcoming deadlines in the next 7 days.')
        return NextResponse.json({ ok: true })
      }

      const overdue = tasks.filter((t: any) => t.due_date < todayStr)
      const dueToday = tasks.filter((t: any) => t.due_date === todayStr)
      const upcoming = tasks.filter((t: any) => t.due_date > todayStr)

      function taskLine(t: any): string {
        const code = t.task_number ? `T-${String(t.task_number).padStart(3, '0')}` : t.id.slice(0, 6)
        const assignee = t.assigned_to ? ` — ${esc(t.assigned_to)}` : ''
        return `• <code>${code}</code> ${esc(t.title)}${assignee}`
      }

      let msg = `📅 <b>Deadlines</b>\n\n`
      if (overdue.length > 0) {
        msg += `🔴 <b>Overdue (${overdue.length})</b>\n`
        overdue.forEach((t: any) => { msg += taskLine(t) + '\n' })
        msg += '\n'
      }
      if (dueToday.length > 0) {
        msg += `🟠 <b>Due Today (${dueToday.length})</b>\n`
        dueToday.forEach((t: any) => { msg += taskLine(t) + '\n' })
        msg += '\n'
      }
      if (upcoming.length > 0) {
        msg += `🟡 <b>Due This Week (${upcoming.length})</b>\n`
        upcoming.forEach((t: any) => {
          const dueDate = new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const code = t.task_number ? `T-${String(t.task_number).padStart(3, '0')}` : t.id.slice(0, 6)
          const assignee = t.assigned_to ? ` — ${esc(t.assigned_to)}` : ''
          msg += `• <code>${code}</code> ${esc(t.title)} · ${dueDate}${assignee}\n`
        })
      }
      msg += `\n<i>Use /done &lt;id&gt; to mark a task complete.</i>`
      await reply(msg)
      return NextResponse.json({ ok: true })
    }

    // ── /standup ──────────────────────────────────────────────────────
    if (cmd === '/standup') {
      const msg = await generateStandupMessage()
      await sendTelegramMessage(msg, { replyToMessageId: messageId })
      return NextResponse.json({ ok: true })
    }

    // ── /tasks [cohort3|cohort4|@name] ─────────────────────────────────
    if (cmd === '/tasks') {
      // Detect team filter: /tasks cohort4  or  /tasks cohort3
      const teamFilter = ['cohort4', 'cohort3'].find(c => rest.toLowerCase().includes(c)) ?? null

      // Detect member filter: /tasks @name
      const mentionedUsers = [...rest.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase())
      const resolvedUser   = mentionedUsers.length
        ? await resolveAssigneeAliases(mentionedUsers[0], supabase)
        : null
      const assigneeFilter = resolvedUser ? assigneeKey(resolvedUser.label) : null

      const cohortFilter = teamFilter ?? 'all'
      const pages = await fetchTaskPages(cohortFilter, assigneeFilter, supabase)

      if (pages.length === 0) {
        const who = resolvedUser ? ` for ${resolvedUser.label}` : teamFilter ? ` in ${COHORT_LABEL[teamFilter]}` : ''
        await reply(`📋 No active tasks found${who}.`)
        return NextResponse.json({ ok: true })
      }

      const token   = await getToken(supabase)
      const chatId  = message.chat?.id as number
      const { text, keyboard } = buildTasksPage(pages, 0, cohortFilter)

      if (token && chatId) {
        await sendWithKeyboard(token, chatId, text, keyboard, messageId)
      } else {
        await reply(text)
      }
      return NextResponse.json({ ok: true })
    }

    // ── /addtask, /done, /update — NLP-powered ──────────────────────
    if (['/addtask', '/done', '/update'].includes(cmd)) {
      if (!rest) {
        const examples: Record<string, string> = {
          '/addtask': (
            `Usage: <code>/addtask &lt;title&gt;</code>\n\n` +
            `<b>Examples:</b>\n` +
            `/addtask fix login bug\n` +
            `/addtask fix login bug, high priority\n` +
            `/addtask fix login @dale urgent`
          ),
          '/done': (
            `Usage: <code>/done &lt;number or keyword&gt;</code>\n\n` +
            `<b>Examples:</b>\n` +
            `/done 23\n` +
            `/done login bug\n` +
            `/done fix api\n\n` +
            `<i>Use the task number or any words from the title.</i>`
          ),
          '/update': (
            `Usage: <code>/update &lt;number or keyword&gt; &lt;status&gt;</code>\n\n` +
            `<b>Examples:</b>\n` +
            `/update 23 in review\n` +
            `/update login in review\n` +
            `/update docs blocked\n\n` +
            `<i>Statuses: backlog · todo · in progress · in review · blocked · done</i>`
          ),
        }
        await reply(examples[cmd])
        return NextResponse.json({ ok: true })
      }

      // ── /done fast path ──────────────────────────────────────────────
      if (cmd === '/done') {
        // Allow multi-word: "/done fix login bug" — join all args as one ref
        const ref = args.join(' ').trim()
        if (!ref) {
          await reply(
            `Usage: <code>/done &lt;number or keyword&gt;</code>\n\n` +
            `<b>Examples:</b>\n/done 23\n/done login bug\n\n` +
            `<i>Use the task number or any words from the title.</i>`
          )
          return NextResponse.json({ ok: true })
        }
        const { tasks: doneTasks, ambiguous: doneAmbiguous } = await findTaskByRef(ref, supabase)
        if (doneTasks.length === 0) {
          await reply(`❌ No active task found matching <b>"${esc(ref)}"</b>.\n\n<i>Use /tasks to see all active tasks.</i>`)
          return NextResponse.json({ ok: true })
        }
        if (doneAmbiguous) {
          const list = doneTasks.map(taskRefLine).join('\n')
          await reply(
            `🔍 Multiple tasks matched <b>"${esc(ref)}"</b>:\n${list}\n\n` +
            `Please be more specific, or use the task number:\n<code>/done &lt;number&gt;</code>`
          )
          return NextResponse.json({ ok: true })
        }
        const doneTask = doneTasks[0]
        await supabase.from('tasks').update({ status: 'done' }).eq('id', doneTask.id)
        await reply(`✅ <b>${esc(doneTask.title)}</b>\nMarked as done. Nice work! 🎉`)
        return NextResponse.json({ ok: true })
      }

      // ── /update fast path ─────────────────────────────────────────────
      if (cmd === '/update') {
        // ref = first arg (number or single keyword); status = everything after
        const ref = args[0]
        const statusRaw = args.slice(1).join(' ').toLowerCase()
          .replace(/mark\s+(as\s+)?/i, '').trim()
          .replace(/[\s-]+/g, '_')

        if (!ref || !statusRaw) {
          await reply(
            `Usage: <code>/update &lt;number or keyword&gt; &lt;status&gt;</code>\n\n` +
            `<b>Examples:</b>\n/update 23 in review\n/update login blocked\n\n` +
            `<i>Valid statuses: backlog · todo · in progress · in review · blocked · done</i>`
          )
          return NextResponse.json({ ok: true })
        }

        let mappedStatus: TaskStatus | null = STATUS_ALIASES[statusRaw.replace(/_/g, '-')]
          ?? STATUS_ALIASES[statusRaw]
          ?? (VALID_STATUSES.includes(statusRaw as TaskStatus) ? statusRaw as TaskStatus : null)

        // Fall back to Claude when alias lookup fails — handles any natural language
        // e.g. "working on it", "up for review", "literally blocked rn"
        if (!mappedStatus) {
          mappedStatus = await parseStatus(statusRaw)
        }

        if (!mappedStatus) {
          await reply(`❌ <b>${esc(statusRaw)}</b> is not a recognized status.\nValid options: backlog · todo · in progress · in review · blocked · done`)
          return NextResponse.json({ ok: true })
        }

        const { tasks: updTasks, ambiguous: updAmbiguous } = await findTaskByRef(ref, supabase)
        if (updTasks.length === 0) {
          await reply(`❌ No active task found matching <b>"${esc(ref)}"</b>.\n\n<i>Use /tasks to see all active tasks.</i>`)
          return NextResponse.json({ ok: true })
        }
        if (updAmbiguous) {
          const list = updTasks.map(taskRefLine).join('\n')
          await reply(
            `🔍 Multiple tasks matched <b>"${esc(ref)}"</b>:\n${list}\n\n` +
            `Please be more specific, or use the task number:\n<code>/update &lt;number&gt; ${statusRaw.replace(/_/g, ' ')}</code>`
          )
          return NextResponse.json({ ok: true })
        }
        const updTask = updTasks[0]
        await supabase.from('tasks').update({ status: mappedStatus }).eq('id', updTask.id)
        const statusEmoji: Record<string, string> = {
          backlog: '📦', todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
        }
        await reply(`${statusEmoji[mappedStatus] ?? '📌'} <b>${esc(updTask.title)}</b>\nUpdated to: <b>${mappedStatus.replace(/_/g, ' ')}</b>`)
        return NextResponse.json({ ok: true })
      }

      // ── /addtask fast paths ──────────────────────────────────────────
      if (cmd === '/addtask') {
        const mentionsInRest = [...rawRest.matchAll(/@(\w+)/g)]
        const hasMultipleMentions = mentionsInRest.length > 1
        const hasNewlines = rawRest.includes('\n')
        const hasGroupedSegments = /(?:Action\s*Plan|Note|Task|Update)\s*:|;\s+|\n\s*\n/i.test(rawRest)

        // Bulk text pasted after /addtask → hand off to bulk parser
        if (hasMultipleMentions || hasNewlines || hasGroupedSegments) {
          const parsed = await parseBulkTasks(rawRest)
          if (parsed.length === 0) {
            await reply('❌ Could not extract any tasks from that message.')
            return NextResponse.json({ ok: true })
          }
          const inserts = parsed.map(t => ({
            title: t.title, status: 'todo' as TaskStatus,
            priority: t.priority, order_index: 0,
            assigned_to: t.assignee === 'unassigned' ? null : t.assignee, camp_id: null,
            due_date: validDate(t.dueDate) ?? defaultDueDate(),
            description: t.description ?? null,
          }))
          const { data: created, error } = await supabase.from('tasks').insert(inserts).select()
          if (error || !created) {
            await reply('❌ Something went wrong while creating the tasks. Please try again.')
            return NextResponse.json({ ok: true })
          }
          const grouped: Record<string, string[]> = {}
          created.forEach((t: any) => {
            const key = t.assigned_to ?? 'unassigned'
            if (!grouped[key]) grouped[key] = []
            const code = t.task_number ? `T-${String(t.task_number).padStart(3, '0')}` : t.id.slice(0, 6)
            const due = t.due_date ? ` · ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''
            const hasLink = t.description && /https?:\/\//.test(t.description) ? ' 🔗' : ''
            grouped[key].push(`• <code>${code}</code> ${esc(t.title)}${due}${hasLink}`)
          })
          let msg = `✅ <b>${created.length} task${created.length > 1 ? 's' : ''} added.</b>\n\n`
          Object.entries(grouped).forEach(([a, items]) => { msg += `@${esc(a)}\n${items.join('\n')}\n\n` })
          await reply(msg.trim())
          return NextResponse.json({ ok: true })
        }

        // Simple title (no flags, no @, no commas) → NLP-clean then insert
        const isSimple = !rawRest.includes('--') && mentionsInRest.length === 0 && !rawRest.includes(',')
        if (isSimple) {
          const cleaned = await cleanTaskTitle(rest)
          const { title: parsedTitle, assignee } = await resolveAssigneeByName(cleaned.title, supabase)
          const finalTitle = parsedTitle || cleaned.title
          const due = cleaned.dueDate ?? defaultDueDate()
          const { data: task, error } = await supabase
            .from('tasks')
            .insert({ title: finalTitle, status: 'todo', priority: cleaned.priority, order_index: 0, assigned_to: assignee, due_date: due })
            .select().single()
          if (error || !task) {
            await reply('❌ Something went wrong while creating the task. Please try again.')
          } else {
            await reply(taskAddedMsg({ ...task, priority: cleaned.priority, due_date: due, assigned_to: assignee }))
          }
          return NextResponse.json({ ok: true })
        }

        // Single @mention (no flags, no commas) → NLP-clean then insert
        const hasSingleMention = mentionsInRest.length === 1 && !rawRest.includes('--') && !rawRest.includes(',')
        if (hasSingleMention) {
          const username = mentionsInRest[0][1].toLowerCase()
          const assignedName = await resolveName(username, supabase)
          // Strip the @mention then let NLP clean the rest
          const withoutMention = rawRest.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
          const cleaned = await cleanTaskTitle(withoutMention)
          if (!cleaned.title) {
            await reply('❌ Task title cannot be empty.')
            return NextResponse.json({ ok: true })
          }
          const due = cleaned.dueDate ?? defaultDueDate()
          const { data: task, error } = await supabase
            .from('tasks')
            .insert({ title: cleaned.title, status: 'todo', priority: cleaned.priority, order_index: 0, assigned_to: assignedName, due_date: due })
            .select().single()
          if (error || !task) {
            await reply('❌ Something went wrong while creating the task. Please try again.')
          } else {
            await reply(taskAddedMsg({ ...task, priority: cleaned.priority, due_date: due, assigned_to: assignedName }))
          }
          return NextResponse.json({ ok: true })
        }
      }

      // Load context for NLP
      const { data: tasksForNlp } = await supabase
        .from('tasks').select('id, title, status, task_number').neq('status', 'done').limit(20)
      const intent = await parseMessage(text, {
        camps: [],
        recentTasks: tasksForNlp ?? [],
      })

      // ── addtask ──
      if (intent.intent === 'addtask') {
        const { title, priority = 'medium', campName, assignedTo, dueDate: parsedDue } = intent
        if (!title) {
          await reply('❌ Task title cannot be empty.')
          return NextResponse.json({ ok: true })
        }
        const validPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium'
        const due = validDate(parsedDue) ?? defaultDueDate()
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({ title, status: 'todo', priority: validPriority, order_index: 0, camp_id: null, assigned_to: assignedTo ?? null, due_date: due, description: null })
          .select().single()
        if (error || !task) {
          await reply('❌ Failed to create task.')
        } else {
          const t3 = esc(task.title)
          await reply(taskAddedMsg({ ...task, priority: validPriority, due_date: due, assigned_to: assignedTo ?? null }, campName))
        }
        return NextResponse.json({ ok: true })
      }

      // ── done ──
      if (intent.intent === 'done') {
        if (!intent.taskId) {
          await reply(`❌ Which task did you mean? Use <code>/tasks</code> to find it, then <code>/done &lt;id&gt;</code>.`)
          return NextResponse.json({ ok: true })
        }
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with that ID. Use <code>/tasks</code> to see active tasks.`)
          return NextResponse.json({ ok: true })
        }
        const nt = esc(task.title)
        await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
        await reply(`✅ <b>${nt}</b>\nMarked as done. Nice work! 🎉`)
        return NextResponse.json({ ok: true })
      }

      // ── update ──
      if (intent.intent === 'update') {
        const mappedStatus = STATUS_ALIASES[intent.status] ?? (VALID_STATUSES.includes(intent.status as TaskStatus) ? intent.status as TaskStatus : null)
        if (!mappedStatus) {
          await reply(`❌ <b>${intent.status}</b> is not a recognized status.\nValid options: backlog · todo · in progress · in review · blocked · done`)
          return NextResponse.json({ ok: true })
        }
        if (!intent.taskId) {
          await reply(`🤔 Got it — status is <b>${mappedStatus.replace(/_/g, ' ')}</b>. Which task should be updated?\nUse <code>/tasks</code> to find it, then <code>/update &lt;id&gt; ${mappedStatus.replace(/_/g, ' ')}</code>.`)
          return NextResponse.json({ ok: true })
        }
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with that ID. Use <code>/tasks</code> to see active tasks.`)
          return NextResponse.json({ ok: true })
        }
        const ut = esc(task.title)
        await supabase.from('tasks').update({ status: mappedStatus }).eq('id', task.id)
        const statusEmoji: Record<string, string> = {
          todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
        }
        await reply(`${statusEmoji[mappedStatus] ?? '📌'} <b>${ut}</b>\nUpdated to: <b>${mappedStatus.replace(/_/g, ' ')}</b>`)
        return NextResponse.json({ ok: true })
      }

      // NLP fallback
      if (intent.intent === 'unknown') {
        await reply(intent.reply)
        return NextResponse.json({ ok: true })
      }
    }

    // Non-slash messages are ignored — use slash commands to interact with Devie.

    // ── Unknown slash command — silently ignore regular chat ──────────
    if (cmd.startsWith('/')) {
      await reply(`❓ Unknown command. Try /help to see what's available.`)
    }
    return NextResponse.json({ ok: true })

  } catch (err: any) {
    console.error('[Telegram webhook error]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// GET /api/telegram/webhook — check current webhook status from Telegram
export async function GET() {
  try {
    const supabase = createServiceClient()
    const { data: cfg } = await supabase
      .from('telegram_config')
      .select('bot_token')
      .limit(1)
      .single()

    const token = process.env.TELEGRAM_BOT_TOKEN ?? cfg?.bot_token
    if (!token) return NextResponse.json({ ok: false, error: 'Bot token not configured' })

    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
