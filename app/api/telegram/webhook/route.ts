import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateStandupMessage, sendTelegramMessage } from '@/lib/standup'
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

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = body?.message
    if (!message?.text) return NextResponse.json({ ok: true })

    const text = (message.text as string).trim()
    const supabase = createServiceClient()

    // Strip bot username suffix (e.g. /help@MyBot)
    const normalized = text.replace(/@\w+/, '').trim()
    const [cmd, ...args] = normalized.split(/\s+/)
    const rest = args.join(' ').trim()

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

    // ── /tasks ────────────────────────────────────────────────────────
    if (cmd === '/tasks') {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, status, priority')
        .neq('status', 'done')
        .order('status')
        .limit(20)

      if (!tasks || tasks.length === 0) {
        await reply('📋 No active tasks right now.')
        return NextResponse.json({ ok: true })
      }

      const grouped: Record<string, string[]> = {}
      tasks.forEach((t: any) => {
        if (!grouped[t.status]) grouped[t.status] = []
        grouped[t.status].push(`• \`${t.id.slice(0, 6)}\` ${t.title}`)
      })

      const labels: Record<string, string> = {
        todo: '📝 To Do', in_progress: '🔄 In Progress',
        in_review: '👀 In Review', blocked: '🚧 Blocked',
      }

      let msg = `📋 *Active Tasks*\n\n`
      Object.entries(grouped).forEach(([status, items]) => {
        msg += `${labels[status] || status}\n${items.join('\n')}\n\n`
      })
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

    // ── /addtask <title> [--camp <name>] [--priority <level>] ─────────
    if (cmd === '/addtask') {
      if (!rest) {
        await reply(
          `Usage: \`/addtask <title>\` optionally with \`--camp <name>\` and/or \`--priority <level>\`\n\n` +
          `*Examples:*\n` +
          `/addtask Fix login bug\n` +
          `/addtask Fix login bug --priority high\n` +
          `/addtask Fix login bug --camp Backend --priority urgent`
        )
        return NextResponse.json({ ok: true })
      }

      // Extract --camp and --priority flags
      const campMatch = rest.match(/--camp\s+(.+?)(?=\s+--|$)/i)
      const priorityMatch = rest.match(/--priority\s+(\w+)/i)
      const campName = campMatch?.[1]?.trim() ?? null
      const priority = priorityMatch?.[1]?.toLowerCase() ?? 'medium'
      const title = rest
        .replace(/--camp\s+.+?(?=\s+--|$)/i, '')
        .replace(/--priority\s+\w+/i, '')
        .trim()

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
        .insert({ title, status: 'todo', priority: validPriority, order_index: 0, camp_id: campId })
        .select()
        .single()

      if (error || !task) {
        await reply('❌ Failed to create task.')
      } else {
        const where = campName ? ` in *${campName}*` : ''
        await reply(`✅ Task added${where}!\n*${task.title}*\nID: \`${task.id.slice(0, 8)}\` · Priority: ${validPriority}`)
      }
      return NextResponse.json({ ok: true })
    }

    // ── /addcamp <name> ───────────────────────────────────────────────
    if (cmd === '/addcamp') {
      if (!rest) {
        await reply(
          `Usage: \`/addcamp <name>\`\n\n` +
          `*Example:*\n` +
          `/addcamp Backend`
        )
        return NextResponse.json({ ok: true })
      }

      const { data: camp, error } = await supabase
        .from('code_camps')
        .insert({ name: rest, status: 'active', progress: 0, resources: [] })
        .select()
        .single()

      if (error || !camp) {
        await reply('❌ Failed to create camp.')
      } else {
        await reply(`🏕️ Camp *${camp.name}* created!\nAdd tasks with /addtask <title> --camp ${camp.name}`)
      }
      return NextResponse.json({ ok: true })
    }

    // ── /done <id> ────────────────────────────────────────────────────
    if (cmd === '/done') {
      if (!rest) {
        await reply(
          `Usage: \`/done <task id>\`\n\n` +
          `*Example:*\n` +
          `/done a1b2c3\n\n` +
          `_Use /tasks to see task IDs_`
        )
        return NextResponse.json({ ok: true })
      }

      const { data: tasks } = await supabase
        .from('tasks').select('id, title').ilike('id', `${rest}%`).limit(1)

      if (!tasks || tasks.length === 0) {
        await reply(`❌ No task found with ID starting with \`${rest}\``)
        return NextResponse.json({ ok: true })
      }

      await supabase.from('tasks').update({ status: 'done' }).eq('id', tasks[0].id)
      await reply(`✅ *${tasks[0].title}*\nMarked as done! Great work! 🎉`)
      return NextResponse.json({ ok: true })
    }

    // ── /update <id> <status> ─────────────────────────────────────────
    if (cmd === '/update') {
      const [taskId, rawStatus] = args
      if (!taskId || !rawStatus) {
        await reply(
          `Usage: \`/update <task id> <status>\`\n\n` +
          `*Example:*\n` +
          `/update a1b2c3 in_progress\n\n` +
          `_Statuses: todo, in_progress, in_review, blocked, done_\n` +
          `_Use /tasks to see task IDs_`
        )
        return NextResponse.json({ ok: true })
      }

      const mappedStatus = STATUS_ALIASES[rawStatus.toLowerCase()] ?? (VALID_STATUSES.includes(rawStatus as TaskStatus) ? rawStatus as TaskStatus : null)
      if (!mappedStatus) {
        await reply(`❌ Unknown status *${rawStatus}*\nValid: ${VALID_STATUSES.join(', ')}`)
        return NextResponse.json({ ok: true })
      }

      const { data: tasks } = await supabase
        .from('tasks').select('id, title').ilike('id', `${taskId}%`).limit(1)

      if (!tasks || tasks.length === 0) {
        await reply(`❌ No task found with ID starting with \`${taskId}\``)
        return NextResponse.json({ ok: true })
      }

      await supabase.from('tasks').update({ status: mappedStatus }).eq('id', tasks[0].id)

      const statusEmoji: Record<string, string> = {
        todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
      }
      await reply(`${statusEmoji[mappedStatus] ?? '📌'} *${tasks[0].title}*\nMoved to: *${mappedStatus.replace(/_/g, ' ')}*`)
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
