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
        `🤖 *Devie Bot — Commands*\n\n` +
        `📋 *View*\n` +
        `/tasks — list active tasks\n` +
        `/camps — list code camps\n` +
        `/standup — send standup report\n\n` +
        `➕ *Create*\n` +
        `/addtask <title> — add a task\n` +
        `/addtask <title> --camp <name> — add to a camp\n` +
        `/addtask <title> --priority high — set priority\n` +
        `/addcamp <name> — create a new camp\n\n` +
        `✏️ *Update*\n` +
        `/done <id> — mark task as done\n` +
        `/update <id> <status> — update task status\n` +
        `_Statuses: todo, in_progress, in_review, blocked, done_`
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
        const where = campFilter ? ` in *${campFilter}*` : ''
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
      let msg = `📋 *Tasks${who}${where}*\n\n`

      // Group by status
      const grouped: Record<string, string[]> = {}
      filtered.forEach((t: any) => {
        if (!grouped[t.status]) grouped[t.status] = []
        const assignee = !mentionedUsers.length && t.assigned_to ? ` · @${t.assigned_to}` : ''
        const camp = !campFilter && t.code_camps?.name ? ` · ${t.code_camps.name}` : ''
        grouped[t.status].push(`• \`${t.id.slice(0, 6)}\` ${t.title}${assignee}${camp}`)
      })

      Object.entries(grouped).forEach(([status, items]) => {
        msg += `${labels[status] || status}\n${items.join('\n')}\n\n`
      })

      // Usage hint
      msg += `_Filter: /tasks @name · /tasks --camp Backend · /tasks @dale @kien_`

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

      let msg = `🏕️ *Code Camps*\n\n`
      camps.forEach((c: any) => {
        const filled = Math.round(c.progress / 10)
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
        msg += `${emoji[c.status] ?? '⚪'} *${c.name}*\n  ${bar} ${c.progress}%\n\n`
      })
      await reply(msg)
      return NextResponse.json({ ok: true })
    }

    // ── /addtask, /addcamp, /done, /update — NLP-powered ─────────────
    if (['/addtask', '/addcamp', '/done', '/update'].includes(cmd)) {
      if (!rest) {
        const examples: Record<string, string> = {
          '/addtask': (
            `Usage: \`/addtask <title>\` — natural language welcome!\n\n` +
            `*Examples:*\n` +
            `/addtask fix login bug\n` +
            `/addtask fix login bug, high priority\n` +
            `/addtask fix login @dale urgent backend camp`
          ),
          '/addcamp': `Usage: \`/addcamp <name>\`\n\n*Example:*\n/addcamp Backend`,
          '/done': `Usage: \`/done <task id>\`\n\n*Example:*\n/done a1b2c3\n\n_Use /tasks to see IDs_`,
          '/update': (
            `Usage: \`/update <id> <status>\` — natural language welcome!\n\n` +
            `*Examples:*\n` +
            `/update a1b2c3 in review\n` +
            `/update a1b2c3 mark as blocked\n\n` +
            `_Use /tasks to see IDs_`
          ),
        }
        await reply(examples[cmd])
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
            await reply(`✅ Task added!\n*${task.title}*\nID: \`${task.id.slice(0, 6)}\` · medium`)
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
            await reply(`❌ No camp found matching *"${campName}"*.\nUse /camps to see all camps.`)
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
          const where = campName ? ` in *${campName}*` : ''
          const assignee = assignedTo ? ` · @${assignedTo}` : ''
          await reply(`✅ Task added${where}!\n*${task.title}*\nID: \`${task.id.slice(0, 8)}\` · ${validPriority}${assignee}`)
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
          await reply(`🏕️ Camp *${camp.name}* created!\nAdd tasks with /addtask <title> ${camp.name} camp`)
        }
        return NextResponse.json({ ok: true })
      }

      // ── done ──
      if (intent.intent === 'done') {
        const { data: tasks } = await supabase
          .from('tasks').select('id, title').ilike('id', `${intent.taskId}%`).limit(1)
        if (!tasks || tasks.length === 0) {
          await reply(`❌ No task found with ID starting with \`${intent.taskId}\``)
          return NextResponse.json({ ok: true })
        }
        await supabase.from('tasks').update({ status: 'done' }).eq('id', tasks[0].id)
        await reply(`✅ *${tasks[0].title}*\nMarked as done! Great work! 🎉`)
        return NextResponse.json({ ok: true })
      }

      // ── update ──
      if (intent.intent === 'update') {
        const mappedStatus = STATUS_ALIASES[intent.status] ?? (VALID_STATUSES.includes(intent.status as TaskStatus) ? intent.status as TaskStatus : null)
        if (!mappedStatus) {
          await reply(`❌ Unknown status *${intent.status}*\nValid: ${VALID_STATUSES.join(', ')}`)
          return NextResponse.json({ ok: true })
        }
        const { data: tasks } = await supabase
          .from('tasks').select('id, title').ilike('id', `${intent.taskId}%`).limit(1)
        if (!tasks || tasks.length === 0) {
          await reply(`❌ No task found with ID starting with \`${intent.taskId}\``)
          return NextResponse.json({ ok: true })
        }
        await supabase.from('tasks').update({ status: mappedStatus }).eq('id', tasks[0].id)
        const statusEmoji: Record<string, string> = {
          todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
        }
        await reply(`${statusEmoji[mappedStatus] ?? '📌'} *${tasks[0].title}*\nMoved to: *${mappedStatus.replace(/_/g, ' ')}*`)
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
        await reply(`❓ Couldn't extract any tasks. Send /help to see what I can do.`)
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

      let msg = `✅ *${created.length} task${created.length > 1 ? 's' : ''} created!*\n\n`
      Object.entries(grouped).forEach(([assignee, items]) => {
        msg += `@${assignee}\n${items.join('\n')}\n\n`
      })
      await reply(msg.trim())
      return NextResponse.json({ ok: true })
    }

    // ── Unknown command ───────────────────────────────────────────────
    await reply(`❓ Unknown command. Send /help to see what I can do.`)
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
