import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateStandupMessage, sendTelegramMessage } from '@/lib/standup'
import { parseBulkTasks, parseMessage, parseStatus, extractDueDate, DEADLINE_KEYWORDS } from '@/lib/nlp'
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

// Keyword gate — only run NLU on messages that plausibly contain a status update.
// Avoids calling the Claude API on every group message.
const NLU_TRIGGER = /\b(working on|wip|in[\s-]?progress|started|picking up|reviewing|in[\s-]?review|blocked|stuck|waiting for|finished|completed|done|shipped|delivered|wrapped)\b/i

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
        `🤖 <b>Devie Bot — Commands</b>\n\n` +
        `📋 <b>View</b>\n` +
        `/tasks — list active tasks\n` +
        `/camps — list code camps\n` +
        `/deadlines — show upcoming deadlines\n` +
        `/standup — send standup report\n\n` +
        `➕ <b>Create</b>\n` +
        `/addtask &lt;title&gt; — add a task (7-day deadline by default)\n` +
        `/addtask &lt;title&gt; by Friday — task with specific deadline\n` +
        `/addtask &lt;title&gt; @username — assign to someone\n` +
        `/addcamp &lt;name&gt; — create a new camp\n\n` +
        `✏️ <b>Update</b>\n` +
        `/done &lt;id&gt; — mark task as done\n` +
        `/update &lt;id&gt; &lt;status&gt; — update task status\n` +
        `<i>Statuses: backlog, todo, in progress, in review, blocked, done</i>`
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
        await reply('📅 No tasks with deadlines in the next 7 days.')
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
      msg += `\n<i>Use /done &lt;id&gt; to mark complete</i>`
      await reply(msg)
      return NextResponse.json({ ok: true })
    }

    // ── /standup ──────────────────────────────────────────────────────
    if (cmd === '/standup') {
      const msg = await generateStandupMessage()
      await sendTelegramMessage(msg, { replyToMessageId: messageId })
      return NextResponse.json({ ok: true })
    }

    // ── /tasks [@name ...] [--camp <name>] ───────────────────────────
    if (cmd === '/tasks') {
      // Parse filters: @mentions and --camp
      const mentionedUsers = [...rest.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase())
      const campFilter = rest.match(/--camp\s+(.+?)(?=\s+--|$|@)/i)?.[1]?.trim() ?? null

      if (!rest && mentionedUsers.length === 0) {
        // Show usage hint alongside results only if no filters
      }

      // Resolve @mentions to member names (how assigned_to is now stored)
      const resolvedNames = await Promise.all(mentionedUsers.map(u => resolveName(u, supabase)))

      let query = supabase
        .from('tasks')
        .select('id, task_number, title, status, priority, assigned_to, camp_id, code_camps(name)')
        .neq('status', 'done')
        .order('status')
        .limit(50)

      // Filter by resolved name or fall back to raw username
      if (resolvedNames.length === 1) {
        query = query.ilike('assigned_to', resolvedNames[0])
      } else if (resolvedNames.length > 1) {
        query = query.in('assigned_to', resolvedNames)
      }

      const { data: tasks } = await query

      // Filter by camp client-side
      let filtered = tasks ?? []
      if (campFilter) {
        filtered = filtered.filter((t: any) =>
          t.code_camps?.name?.toLowerCase().includes(campFilter.toLowerCase())
        )
      }

      if (filtered.length === 0) {
        const who = resolvedNames.length ? ` for ${resolvedNames.join(', ')}` : ''
        const where = campFilter ? ` in <b>${campFilter}</b>` : ''
        await reply(`📋 No active tasks${who}${where}.`)
        return NextResponse.json({ ok: true })
      }

      const labels: Record<string, string> = {
        todo: '📝 To Do', in_progress: '🔄 In Progress',
        in_review: '👀 In Review', blocked: '🚧 Blocked',
      }

      // Build header — show resolved names not raw @usernames
      const who = resolvedNames.length ? ` · ${resolvedNames.join(', ')}` : ''
      const where = campFilter ? ` · ${campFilter}` : ''
      let msg = `📋 <b>Tasks${who}${where}</b>\n\n`

      // Group by status
      const grouped: Record<string, string[]> = {}
      filtered.forEach((t: any) => {
        if (!grouped[t.status]) grouped[t.status] = []
        // Show assignee name when listing all tasks (not filtered by a specific person)
        const assignee = !resolvedNames.length && t.assigned_to
          ? ` — ${esc(t.assigned_to)}`
          : ''
        const camp = !campFilter && t.code_camps?.name ? ` · ${t.code_camps.name}` : ''
        const title = esc(t.title)
        const code = t.task_number ? `T-${String(t.task_number).padStart(3, '0')}` : t.id.slice(0, 6)
        grouped[t.status].push(`• <code>${code}</code> ${title}${assignee}${camp}`)
      })

      Object.entries(grouped).forEach(([status, items]) => {
        msg += `${labels[status] || status}\n${items.join('\n')}\n\n`
      })

      msg += `<i>Filter: /tasks @name · /tasks --camp Backend</i>`

      await reply(msg)
      return NextResponse.json({ ok: true })
    }

    // ── /camps ────────────────────────────────────────────────────────
    if (cmd === '/camps') {
      const { data: camps } = await supabase
        .from('code_camps').select('name, status, progress').order('status')

      if (!camps || camps.length === 0) {
        await reply('🏕️ No Code Camps found.')
        return NextResponse.json({ ok: true })
      }

      const emoji: Record<string, string> = {
        active: '🟢', paused: '🟡', completed: '🔵', archived: '⚫',
      }

      let msg = `🏕️ <b>Code Camps</b>\n\n`
      camps.forEach((c: any) => {
        const filled = Math.round(c.progress / 10)
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
        const name = esc(c.name)
        msg += `${emoji[c.status] ?? '⚪'} <b>${name}</b>\n  ${bar} ${c.progress}%\n\n`
      })
      await reply(msg)
      return NextResponse.json({ ok: true })
    }

    // ── /addtask, /addcamp, /done, /update — NLP-powered ─────────────
    if (['/addtask', '/addcamp', '/done', '/update'].includes(cmd)) {
      if (!rest) {
        const examples: Record<string, string> = {
          '/addtask': (
            `Usage: <code>/addtask &lt;title&gt;</code>\n\n` +
            `<b>Examples:</b>\n` +
            `/addtask fix login bug\n` +
            `/addtask fix login bug, high priority\n` +
            `/addtask fix login @dale urgent`
          ),
          '/addcamp': `Usage: <code>/addcamp &lt;name&gt;</code>\n\n<b>Example:</b>\n/addcamp Backend`,
          '/done': `Usage: <code>/done &lt;task id&gt;</code>\n\n<b>Example:</b>\n/done a1b2c3\n\n<i>Use /tasks to see IDs</i>`,
          '/update': (
            `Usage: <code>/update &lt;id&gt; &lt;status&gt;</code>\n\n` +
            `<b>Examples:</b>\n` +
            `/update a1b2c3 in review\n` +
            `/update a1b2c3 blocked\n\n` +
            `<i>Use /tasks to see IDs</i>`
          ),
        }
        await reply(examples[cmd])
        return NextResponse.json({ ok: true })
      }

      // ── /done fast path ──────────────────────────────────────────────
      if (cmd === '/done') {
        const taskId = args[0]
        if (!taskId) {
          await reply('❌ Provide a task ID.\nExample: <code>/done a1b2c3</code>\n\n<i>Use /tasks to see IDs</i>')
          return NextResponse.json({ ok: true })
        }
        const task = await findTaskByPrefix(taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with ID starting with <code>${taskId}</code>`)
          return NextResponse.json({ ok: true })
        }
        await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
        const doneTitle = esc(task.title)
        await reply(`✅ <b>${doneTitle}</b>\nMarked as done! Great work! 🎉`)
        return NextResponse.json({ ok: true })
      }

      // ── /update fast path ─────────────────────────────────────────────
      if (cmd === '/update') {
        const taskId = args[0]
        const statusRaw = args.slice(1).join(' ').toLowerCase()
          .replace(/mark\s+(as\s+)?/i, '').trim()
          .replace(/[\s-]+/g, '_')

        if (!taskId || !statusRaw) {
          await reply('❌ Usage: <code>/update &lt;id&gt; &lt;status&gt;</code>\n\nStatuses: todo · in progress · in review · blocked · done\n\n<i>Use /tasks to see IDs</i>')
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
          await reply(`❌ Unknown status <b>${esc(statusRaw)}</b>\nValid: todo · in progress · in review · blocked · done`)
          return NextResponse.json({ ok: true })
        }

        const task = await findTaskByPrefix(taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with ID starting with <code>${taskId}</code>`)
          return NextResponse.json({ ok: true })
        }
        await supabase.from('tasks').update({ status: mappedStatus }).eq('id', task.id)
        const statusEmoji: Record<string, string> = {
          todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
        }
        const updTitle = esc(task.title)
        await reply(`${statusEmoji[mappedStatus] ?? '📌'} <b>${updTitle}</b>\nMoved to: <b>${mappedStatus.replace(/_/g, ' ')}</b>`)
        return NextResponse.json({ ok: true })
      }

      // ── /addtask fast paths ──────────────────────────────────────────
      if (cmd === '/addtask') {
        const mentionsInRest = [...rawRest.matchAll(/@(\w+)/g)]
        const hasMultipleMentions = mentionsInRest.length > 1
        const hasNewlines = rawRest.includes('\n')

        // Bulk text pasted after /addtask → hand off to bulk parser
        if (hasMultipleMentions || hasNewlines) {
          const parsed = await parseBulkTasks(rawRest)
          if (parsed.length === 0) {
            await reply('❌ Could not extract tasks from that text.')
            return NextResponse.json({ ok: true })
          }
          const inserts = parsed.map(t => ({
            title: t.title, status: 'todo' as TaskStatus,
            priority: t.priority, order_index: 0,
            assigned_to: t.assignee, camp_id: null,
            due_date: validDate(t.dueDate) ?? defaultDueDate(),
          }))
          const { data: created, error } = await supabase.from('tasks').insert(inserts).select()
          if (error || !created) {
            await reply('❌ Failed to create tasks.')
            return NextResponse.json({ ok: true })
          }
          const grouped: Record<string, string[]> = {}
          created.forEach((t: any) => {
            const key = t.assigned_to ?? 'unassigned'
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(`• ${t.title}`)
          })
          let msg = `✅ *${created.length} task${created.length > 1 ? 's' : ''} created!*\n\n`
          Object.entries(grouped).forEach(([a, items]) => { msg += `@${a}\n${items.join('\n')}\n\n` })
          await reply(msg.trim())
          return NextResponse.json({ ok: true })
        }

        // Simple title (no flags, no @, no commas) → check trailing name then insert
        const isSimple = !rawRest.includes('--') && mentionsInRest.length === 0 && !rawRest.includes(',')
        if (isSimple) {
          // Extract deadline if keywords present, then strip it from the title
          let simpleText = rest
          let simpleDueDate: string | null = null
          if (DEADLINE_KEYWORDS.test(rest)) {
            const extracted = await extractDueDate(rest)
            simpleDueDate = extracted.dueDate
            simpleText = extracted.cleanText || rest
          }
          // Try to detect a member name at the end of the title (e.g. "Fix bug David")
          const { title: parsedTitle, assignee } = await resolveAssigneeByName(simpleText, supabase)
          const finalTitle = parsedTitle || simpleText
          const due = simpleDueDate ?? defaultDueDate()
          const { data: task, error } = await supabase
            .from('tasks')
            .insert({ title: finalTitle, status: 'todo', priority: 'medium', order_index: 0, assigned_to: assignee, due_date: due })
            .select().single()
          if (error || !task) {
            await reply('❌ Failed to create task.')
          } else {
            const t0 = esc(task.title)
            const assigneeLine = assignee ? ` · ${esc(assignee)}` : ''
            const dueDisplay = new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            await reply(`✅ Task added!\n<b>${t0}</b>\nID: <code>${task.task_number ? `T-${String(task.task_number).padStart(3, '0')}` : task.id.slice(0, 6)}</code> · medium · 📅 ${dueDisplay}${assigneeLine}`)
          }
          return NextResponse.json({ ok: true })
        }

        // Single @mention (no flags, no commas) → parse directly without NLP
        const hasSingleMention = mentionsInRest.length === 1 && !rawRest.includes('--') && !rawRest.includes(',')
        if (hasSingleMention) {
          const username = mentionsInRest[0][1].toLowerCase()
          // Resolve @username → member name (the canonical assigned_to value)
          const assignedName = await resolveName(username, supabase)
          // Strip the @mention from the raw text to get the title
          let titleRaw = rawRest.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
          // Extract optional priority keyword
          let priority = 'medium'
          const priorityMatch = titleRaw.match(/\b(urgent|high|low|medium)\b/i)
          if (priorityMatch) {
            priority = priorityMatch[1].toLowerCase()
            titleRaw = titleRaw.replace(priorityMatch[0], '').replace(/\s+/g, ' ').trim()
          }
          // Extract deadline if keywords present
          let mentionDueDate: string | null = null
          if (DEADLINE_KEYWORDS.test(titleRaw)) {
            const extracted = await extractDueDate(titleRaw)
            mentionDueDate = extracted.dueDate
            titleRaw = extracted.cleanText || titleRaw
          }
          if (!titleRaw) {
            await reply('❌ Task title cannot be empty.')
            return NextResponse.json({ ok: true })
          }
          const due = mentionDueDate ?? defaultDueDate()
          const { data: task, error } = await supabase
            .from('tasks')
            .insert({ title: titleRaw, status: 'todo', priority, order_index: 0, assigned_to: assignedName, due_date: due })
            .select().single()
          if (error || !task) {
            await reply('❌ Failed to create task.')
          } else {
            const t1 = esc(task.title)
            const nameDisplay = esc(assignedName)
            const dueDisplay = new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            await reply(`✅ Task added!\n<b>${t1}</b>\nID: <code>${task.task_number ? `T-${String(task.task_number).padStart(3, '0')}` : task.id.slice(0, 8)}</code> · ${priority} · ${nameDisplay} · 📅 ${dueDisplay}`)
          }
          return NextResponse.json({ ok: true })
        }
      }

      // Load context for NLP
      const [campsRes, tasksRes] = await Promise.all([
        supabase.from('code_camps').select('name').eq('status', 'active'),
        supabase.from('tasks').select('id, title, status').neq('status', 'done').limit(20),
      ])
      const intent = await parseMessage(text, {
        camps: (campsRes.data ?? []).map((c: any) => c.name),
        recentTasks: tasksRes.data ?? [],
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
        let campId: string | null = null
        if (campName) {
          const { data: camps } = await supabase
            .from('code_camps').select('id, name').ilike('name', `%${campName}%`).limit(1)
          if (!camps || camps.length === 0) {
            await reply(`❌ No camp found matching <b>"${campName}"</b>.\nUse /camps to see all camps.`)
            return NextResponse.json({ ok: true })
          }
          campId = camps[0].id
        }
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({ title, status: 'todo', priority: validPriority, order_index: 0, camp_id: campId, assigned_to: assignedTo ?? null, due_date: due })
          .select().single()
        if (error || !task) {
          await reply('❌ Failed to create task.')
        } else {
          const t3 = esc(task.title)
          const where = campName ? ` in <b>${campName}</b>` : ''
          const assignee = assignedTo ? ` · @${assignedTo}` : ''
          const dueDisplay = new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          await reply(`✅ Task added${where}!\n<b>${t3}</b>\nID: <code>${task.task_number ? `T-${String(task.task_number).padStart(3, '0')}` : task.id.slice(0, 8)}</code> · ${validPriority} · 📅 ${dueDisplay}${assignee}`)
        }
        return NextResponse.json({ ok: true })
      }

      // ── addcamp ──
      if (intent.intent === 'addcamp') {
        const { data: camp, error } = await supabase
          .from('code_camps')
          .insert({ name: intent.campName, status: 'active', progress: 0, resources: [] })
          .select().single()
        if (error || !camp) {
          await reply('❌ Failed to create camp.')
        } else {
          const cn = esc(camp.name)
          await reply(`🏕️ Camp <b>${cn}</b> created!\nAdd tasks with /addtask &lt;title&gt; ${cn} camp`)
        }
        return NextResponse.json({ ok: true })
      }

      // ── done ──
      if (intent.intent === 'done') {
        if (!intent.taskId) {
          await reply(`❌ Which task? Use <code>/tasks</code> to find the ID, then <code>/done &lt;id&gt;</code>`)
          return NextResponse.json({ ok: true })
        }
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with ID starting with <code>${intent.taskId}</code>`)
          return NextResponse.json({ ok: true })
        }
        const nt = esc(task.title)
        await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
        await reply(`✅ <b>${nt}</b>\nMarked as done! Great work! 🎉`)
        return NextResponse.json({ ok: true })
      }

      // ── update ──
      if (intent.intent === 'update') {
        const mappedStatus = STATUS_ALIASES[intent.status] ?? (VALID_STATUSES.includes(intent.status as TaskStatus) ? intent.status as TaskStatus : null)
        if (!mappedStatus) {
          await reply(`❌ Unknown status <b>${intent.status}</b>\nValid: todo, in progress, in review, blocked, done`)
          return NextResponse.json({ ok: true })
        }
        if (!intent.taskId) {
          await reply(`🤔 Status understood as <b>${mappedStatus.replace(/_/g, ' ')}</b> — which task?\nUse <code>/tasks</code> to find the ID, then <code>/update &lt;id&gt; ${mappedStatus.replace(/_/g, ' ')}</code>`)
          return NextResponse.json({ ok: true })
        }
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with ID starting with <code>${intent.taskId}</code>`)
          return NextResponse.json({ ok: true })
        }
        const ut = esc(task.title)
        await supabase.from('tasks').update({ status: mappedStatus }).eq('id', task.id)
        const statusEmoji: Record<string, string> = {
          todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
        }
        await reply(`${statusEmoji[mappedStatus] ?? '📌'} <b>${ut}</b>\nMoved to: <b>${mappedStatus.replace(/_/g, ' ')}</b>`)
        return NextResponse.json({ ok: true })
      }

      // NLP fallback
      if (intent.intent === 'unknown') {
        await reply(intent.reply)
        return NextResponse.json({ ok: true })
      }
    }

    // ── Bulk task assignment (natural language with @mentions) ────────
    const mentionCount = (text.match(/@\w/g) || []).length
    if (!cmd.startsWith('/') && mentionCount >= 1) {
      const parsed = await parseBulkTasks(text)
      if (parsed.length === 0) {
        // Couldn't extract tasks from this free-form message — stay silent
        return NextResponse.json({ ok: true })
      }

      const inserts = parsed.map(t => ({
        title: t.title,
        status: 'todo' as TaskStatus,
        priority: t.priority,
        order_index: 0,
        assigned_to: t.assignee,
        camp_id: null,
        due_date: validDate(t.dueDate) ?? defaultDueDate(),
      }))

      const { data: created, error } = await supabase.from('tasks').insert(inserts).select()

      if (error || !created) {
        await reply('❌ Failed to create tasks.')
        return NextResponse.json({ ok: true })
      }

      // Group by assignee for the summary
      const grouped: Record<string, string[]> = {}
      created.forEach((t: any) => {
        const key = t.assigned_to ?? 'unassigned'
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(`• ${t.title}`)
      })

      let msg = `✅ <b>${created.length} task${created.length > 1 ? 's' : ''} created!</b>\n\n`
      Object.entries(grouped).forEach(([assignee, items]) => {
        const safeItems = items.map(i => esc(i))
        msg += `@${assignee}\n${safeItems.join('\n')}\n\n`
      })
      await reply(msg.trim())
      return NextResponse.json({ ok: true })
    }

    // ── NLU: plain-text status expressions (no slash, no @mention) ───────
    // Only fires when the message contains recognisable status-related words,
    // keeping Claude API calls out of ordinary group chatter.
    if (!cmd.startsWith('/') && NLU_TRIGGER.test(text)) {
      const [campsRes, tasksRes] = await Promise.all([
        supabase.from('code_camps').select('name').eq('status', 'active'),
        supabase.from('tasks').select('id, title, status, task_number').neq('status', 'done').limit(30),
      ])
      const intent = await parseMessage(text, {
        camps: (campsRes.data ?? []).map((c: any) => c.name),
        recentTasks: tasksRes.data ?? [],
      })

      if (intent.intent === 'update') {
        const mapped: TaskStatus | null = STATUS_ALIASES[intent.status]
          ?? (VALID_STATUSES.includes(intent.status as TaskStatus) ? intent.status as TaskStatus : null)

        if (mapped && intent.taskId) {
          const task = await findTaskByPrefix(intent.taskId, supabase)
          if (task) {
            await supabase.from('tasks').update({ status: mapped }).eq('id', task.id)
            const E: Record<string, string> = {
              todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
            }
            await reply(`${E[mapped] ?? '📌'} Got it! <b>${esc(task.title)}</b> → <b>${mapped.replace(/_/g, ' ')}</b>`)
            return NextResponse.json({ ok: true })
          }
        }

        // Status was understood but no matching task found — nudge the user
        if (mapped && !intent.taskId) {
          await reply(
            `🤔 Sounds like something is <b>${mapped.replace(/_/g, ' ')}</b>.\n` +
            `Which task? Use <code>/tasks</code> to see active tasks, then:\n` +
            `<code>/update &lt;id&gt; ${mapped.replace(/_/g, ' ')}</code>`
          )
          return NextResponse.json({ ok: true })
        }
      }

      if (intent.intent === 'done' && intent.taskId) {
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (task) {
          await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
          await reply(`✅ <b>${esc(task.title)}</b> marked as done! Great work! 🎉`)
          return NextResponse.json({ ok: true })
        }
      }

      // Unknown intent or no task found — stay silent, don't interrupt group chat
      return NextResponse.json({ ok: true })
    }

    // ── Unknown slash command — silently ignore regular chat ──────────
    if (cmd.startsWith('/')) {
      await reply(`❓ Unknown command. Send /help to see what I can do.`)
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
