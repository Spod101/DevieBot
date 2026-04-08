import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { generateStandupMessage, sendTelegramMessage } from '@/lib/standup'
import { parseMessage } from '@/lib/nlp'
import type { TaskStatus } from '@/types/database'

const STATUS_MAP: Record<string, TaskStatus> = {
  todo: 'todo',
  'to-do': 'todo',
  'to do': 'todo',
  'in-progress': 'in_progress',
  'in progress': 'in_progress',
  inprogress: 'in_progress',
  progress: 'in_progress',
  review: 'in_review',
  'in-review': 'in_review',
  'in review': 'in_review',
  blocked: 'blocked',
  done: 'done',
  complete: 'done',
  completed: 'done',
  finish: 'done',
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

    // ── Fetch context for NLP ──────────────────────────────────────
    const [campsRes, tasksRes] = await Promise.all([
      supabase.from('code_camps').select('name').eq('status', 'active'),
      supabase.from('tasks').select('id, title, status').neq('status', 'done').order('updated_at', { ascending: false }).limit(15),
    ])
    const campNames = (campsRes.data || []).map((c: any) => c.name)
    const recentTasks = tasksRes.data || []

    // ── Parse intent (NLP handles everything including slash commands) ─
    const parsed = await parseMessage(text, { camps: campNames, recentTasks })

    // ── Execute intent ─────────────────────────────────────────────

    if (parsed.intent === 'standup') {
      const msg = await generateStandupMessage()
      await sendTelegramMessage(msg)
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'tasks') {
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

    if (parsed.intent === 'camps') {
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
        const bar = '█'.repeat(Math.round(c.progress / 10)) + '░'.repeat(10 - Math.round(c.progress / 10))
        msg += `${emoji[c.status]} *${c.name}*\n  ${bar} ${c.progress}%\n\n`
      })
      await reply(msg)
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'addtask') {
      const { title, priority = 'medium', campName } = parsed

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
        .insert({
          title,
          status: 'todo',
          priority: (['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium') as any,
          order_index: 0,
          camp_id: campId,
        })
        .select()
        .single()

      if (error || !task) {
        await reply('❌ Failed to create task.')
      } else {
        const where = campName ? ` in *${campName}*` : ' on General Board'
        await reply(`✅ Task added${where}!\n*${task.title}*\nID: \`${task.id.slice(0, 8)}\` · Priority: ${priority}`)
      }
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'addcamp') {
      const { campName, taskTitle } = parsed

      const { data: camp, error: campError } = await supabase
        .from('code_camps')
        .insert({ name: campName, status: 'active', progress: 0, resources: [] })
        .select()
        .single()

      if (campError || !camp) {
        await reply('❌ Failed to create camp.')
        return NextResponse.json({ ok: true })
      }

      const { data: task } = await supabase
        .from('tasks')
        .insert({ title: taskTitle, status: 'todo', priority: 'medium', order_index: 0, camp_id: camp.id })
        .select()
        .single()

      await reply(
        `🏕️ Camp *${camp.name}* created!\n` +
        `✅ Task added: *${task?.title ?? taskTitle}*\nID: \`${task?.id?.slice(0, 8) ?? '—'}\``
      )
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'update') {
      const { taskId, status } = parsed
      const mappedStatus = STATUS_MAP[status.toLowerCase()] || status as TaskStatus

      const { data: tasks } = await supabase
        .from('tasks').select('id, title').ilike('id', `${taskId}%`).limit(1)

      if (!tasks || tasks.length === 0) {
        await reply(`❌ No task found with ID starting with \`${taskId}\``)
        return NextResponse.json({ ok: true })
      }

      const task = tasks[0]
      await supabase.from('tasks').update({ status: mappedStatus }).eq('id', task.id)

      const statusEmoji: Record<string, string> = {
        todo: '📝', in_progress: '🔄', in_review: '👀', blocked: '🚧', done: '✅',
      }
      await reply(`${statusEmoji[mappedStatus] ?? '📌'} *${task.title}*\nMoved to: *${mappedStatus.replace('_', ' ')}*`)
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'done') {
      const { taskId } = parsed

      const { data: tasks } = await supabase
        .from('tasks').select('id, title').ilike('id', `${taskId}%`).limit(1)

      if (!tasks || tasks.length === 0) {
        await reply(`❌ No task found with ID starting with \`${taskId}\``)
        return NextResponse.json({ ok: true })
      }

      const task = tasks[0]
      await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
      await reply(`✅ *${task.title}*\nMarked as done! Great work! 🎉`)
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'help') {
      await reply(
        `🤖 *Devie Bot — I understand natural language!*\n\n` +
        `Just tell me what you want:\n\n` +
        `📝 *Add tasks*\n` +
        `"add a task to fix the login bug"\n` +
        `"add high priority task: deploy to production"\n` +
        `"add a task to CodeCamp: set up CI/CD"\n\n` +
        `🔄 *Update tasks*\n` +
        `"mark abc123 as done"\n` +
        `"move abc123 to in progress"\n` +
        `"abc123 is blocked"\n\n` +
        `📋 *View tasks & camps*\n` +
        `"show me all tasks"\n` +
        `"what camps do we have"\n` +
        `"send the standup"\n\n` +
        `_Or use slash commands: /addtask /tasks /camps /standup /done /help_`
      )
      return NextResponse.json({ ok: true })
    }

    if (parsed.intent === 'unknown') {
      await reply(parsed.reply)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[Telegram webhook error]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
