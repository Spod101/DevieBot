import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateStandupMessage, sendTelegramMessage } from '@/lib/standup'
import { parseBulkTasks, parseMessage } from '@/lib/nlp'
import type { TaskStatus } from '@/types/database'

const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent']

const STATUS_ALIASES: Record<string, TaskStatus> = {
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


async function reply(text: string) {
  await sendTelegramMessage(text)
}

// UUID ilike doesn't work in PostgREST — fetch and filter client-side by prefix
async function findTaskByPrefix(prefix: string, supabase: ReturnType<typeof createServiceClient>) {
  const { data } = await supabase.from('tasks').select('id, title').limit(500)
  return (data ?? []).find((t: any) => t.id.startsWith(prefix.toLowerCase())) ?? null
}

// Auto-register the sender as a member if they're not already in the DB
async function syncMember(from: {
  id: number
  first_name: string
  last_name?: string
  username?: string
}, supabase: ReturnType<typeof createServiceClient>) {
  try {
    const telegramId = String(from.id)

    // Check if already registered
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle()

    if (existing) return // already in DB, nothing to do

    const { error } = await supabase.from('members').insert({
      telegram_id: telegramId,
      telegram_username: from.username ?? null,
    })

    if (error) {
      console.error('[syncMember] insert failed:', error.message, error.details)
    } else {
      console.log(`[syncMember] registered new member tg:${telegramId} @${from.username ?? 'no-username'}`)
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

    const text = (message.text as string).trim()

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
        `/standup — send standup report\n\n` +
        `➕ <b>Create</b>\n` +
        `/addtask &lt;title&gt; — add a task\n` +
        `/addtask &lt;title&gt; @username — assign to someone\n` +
        `/addcamp &lt;name&gt; — create a new camp\n\n` +
        `✏️ <b>Update</b>\n` +
        `/done &lt;id&gt; — mark task as done\n` +
        `/update &lt;id&gt; &lt;status&gt; — update task status\n` +
        `<i>Statuses: todo, in progress, in review, blocked, done</i>`
      )
      return NextResponse.json({ ok: true })
    }

    // ── /standup ──────────────────────────────────────────────────────
    if (cmd === '/standup') {
      const msg = await generateStandupMessage()
      await sendTelegramMessage(msg)
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

      let query = supabase
        .from('tasks')
        .select('id, title, status, priority, assigned_to, camp_id, code_camps(name)')
        .neq('status', 'done')
        .order('status')
        .limit(50)

      if (mentionedUsers.length === 1) {
        query = query.ilike('assigned_to', mentionedUsers[0])
      } else if (mentionedUsers.length > 1) {
        query = query.in('assigned_to', mentionedUsers)
      }

      const { data: tasks } = await query

      // Filter by camp client-side (camp name lookup)
      let filtered = tasks ?? []
      if (campFilter) {
        filtered = filtered.filter((t: any) =>
          t.code_camps?.name?.toLowerCase().includes(campFilter.toLowerCase())
        )
      }

      if (filtered.length === 0) {
        const who = mentionedUsers.length ? ` for ${mentionedUsers.map(u => `@${u}`).join(', ')}` : ''
        const where = campFilter ? ` in <b>${campFilter}</b>` : ''
        await reply(`📋 No active tasks${who}${where}.`)
        return NextResponse.json({ ok: true })
      }

      const labels: Record<string, string> = {
        todo: '📝 To Do', in_progress: '🔄 In Progress',
        in_review: '👀 In Review', blocked: '🚧 Blocked',
      }

      // Build header
      const who = mentionedUsers.length ? ` · ${mentionedUsers.map(u => `@${u}`).join(', ')}` : ''
      const where = campFilter ? ` · ${campFilter}` : ''
      let msg = `📋 <b>Tasks${who}${where}</b>\n\n`

      // Group by status
      const grouped: Record<string, string[]> = {}
      filtered.forEach((t: any) => {
        if (!grouped[t.status]) grouped[t.status] = []
        const assignee = !mentionedUsers.length && t.assigned_to ? ` · @${t.assigned_to}` : ''
        const camp = !campFilter && t.code_camps?.name ? ` · ${t.code_camps.name}` : ''
        const title = (t.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        grouped[t.status].push(`• <code>${t.id.slice(0, 6)}</code> ${title}${assignee}${camp}`)
      })

      Object.entries(grouped).forEach(([status, items]) => {
        msg += `${labels[status] || status}\n${items.join('\n')}\n\n`
      })

      // Usage hint
      msg += `<i>Filter: /tasks @name · /tasks --camp Backend · /tasks @dale @kien</i>`

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
        const name = (c.name as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
        const doneTitle = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

        const mappedStatus = STATUS_ALIASES[statusRaw.replace(/_/g, '-')]
          ?? STATUS_ALIASES[statusRaw]
          ?? (VALID_STATUSES.includes(statusRaw as TaskStatus) ? statusRaw as TaskStatus : null)

        if (!mappedStatus) {
          await reply(`❌ Unknown status <b>${statusRaw}</b>\nValid: todo, in progress, in review, blocked, done`)
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
        const updTitle = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

        // Simple title (no flags, no @, no commas) → skip NLP entirely
        const isSimple = !rawRest.includes('--') && mentionsInRest.length === 0 && !rawRest.includes(',')
        if (isSimple) {
          const { data: task, error } = await supabase
            .from('tasks')
            .insert({ title: rest, status: 'todo', priority: 'medium', order_index: 0 })
            .select().single()
          if (error || !task) {
            await reply('❌ Failed to create task.')
          } else {
            const t0 = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            await reply(`✅ Task added!\n<b>${t0}</b>\nID: <code>${task.id.slice(0, 6)}</code> · medium`)
          }
          return NextResponse.json({ ok: true })
        }

        // Single @mention (no flags, no commas) → parse directly without NLP
        const hasSingleMention = mentionsInRest.length === 1 && !rawRest.includes('--') && !rawRest.includes(',')
        if (hasSingleMention) {
          const username = mentionsInRest[0][1].toLowerCase()
          // Strip the @mention from the raw text to get the title
          let titleRaw = rawRest.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
          // Extract optional priority keyword
          let priority = 'medium'
          const priorityMatch = titleRaw.match(/\b(urgent|high|low|medium)\b/i)
          if (priorityMatch) {
            priority = priorityMatch[1].toLowerCase()
            titleRaw = titleRaw.replace(priorityMatch[0], '').replace(/\s+/g, ' ').trim()
          }
          if (!titleRaw) {
            await reply('❌ Task title cannot be empty.')
            return NextResponse.json({ ok: true })
          }
          const { data: task, error } = await supabase
            .from('tasks')
            .insert({ title: titleRaw, status: 'todo', priority, order_index: 0, assigned_to: username })
            .select().single()
          if (error || !task) {
            await reply('❌ Failed to create task.')
          } else {
            const t1 = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            await reply(`✅ Task added!\n<b>${t1}</b>\nID: <code>${task.id.slice(0, 8)}</code> · ${priority} · @${username}`)
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
        const { title, priority = 'medium', campName, assignedTo } = intent
        if (!title) {
          await reply('❌ Task title cannot be empty.')
          return NextResponse.json({ ok: true })
        }
        const validPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium'
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
          .insert({ title, status: 'todo', priority: validPriority, order_index: 0, camp_id: campId, assigned_to: assignedTo ?? null })
          .select().single()
        if (error || !task) {
          await reply('❌ Failed to create task.')
        } else {
          const t3 = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          const where = campName ? ` in <b>${campName}</b>` : ''
          const assignee = assignedTo ? ` · @${assignedTo}` : ''
          await reply(`✅ Task added${where}!\n<b>${t3}</b>\nID: <code>${task.id.slice(0, 8)}</code> · ${validPriority}${assignee}`)
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
          const cn = (camp.name as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          await reply(`🏕️ Camp <b>${cn}</b> created!\nAdd tasks with /addtask &lt;title&gt; ${cn} camp`)
        }
        return NextResponse.json({ ok: true })
      }

      // ── done ──
      if (intent.intent === 'done') {
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with ID starting with \`${intent.taskId}\``)
          return NextResponse.json({ ok: true })
        }
        const nt = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
        const task = await findTaskByPrefix(intent.taskId, supabase)
        if (!task) {
          await reply(`❌ No task found with ID starting with <code>${intent.taskId}</code>`)
          return NextResponse.json({ ok: true })
        }
        const ut = (task.title as string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
        const safeItems = items.map(i => i.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        msg += `@${assignee}\n${safeItems.join('\n')}\n\n`
      })
      await reply(msg.trim())
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
