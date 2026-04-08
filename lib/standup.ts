import { createServiceClient } from '@/lib/supabase/service'
import type { Task, CodeCamp } from '@/types/database'

export async function generateStandupMessage(): Promise<string> {
  const supabase = createServiceClient()

  const [tasksRes, campsRes] = await Promise.all([
    supabase.from('tasks').select('*, tags:task_tags(tag:tags(*))').order('updated_at', { ascending: false }),
    supabase.from('code_camps').select('*').eq('status', 'active').order('name'),
  ])

  const tasks: Task[] = (tasksRes.data || []).map((t: any) => ({
    ...t,
    tags: t.tags?.map((tt: any) => tt.tag).filter(Boolean) || [],
  }))
  const camps: CodeCamp[] = campsRes.data || []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const doneTasks = tasks.filter(t => t.status === 'done')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const todoTasks = tasks.filter(t => t.status === 'todo')
  const blockedTasks = tasks.filter(t => t.status === 'blocked')
  const overdueTasks = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < today && t.status !== 'done'
  )
  const urgentTasks = tasks.filter(t =>
    t.priority === 'urgent' && t.status !== 'done'
  )

  function formatTaskList(list: Task[], limit = 5): string {
    if (list.length === 0) return '  _None_'
    const shown = list.slice(0, limit).map(t => `  • ${t.title}`)
    const extra = list.length > limit ? `  _...and ${list.length - limit} more_` : ''
    return [...shown, extra].filter(Boolean).join('\n')
  }

  const date = today.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  let message = `📋 *Daily Standup — ${date}*\n\n`

  message += `✅ *Done*\n${formatTaskList(doneTasks)}\n\n`
  message += `🔄 *In Progress*\n${formatTaskList(inProgressTasks)}\n\n`
  message += `📝 *To Do*\n${formatTaskList(todoTasks)}\n\n`

  if (blockedTasks.length > 0) {
    message += `🚧 *Blocked*\n${formatTaskList(blockedTasks)}\n\n`
  }

  if (overdueTasks.length > 0) {
    message += `⏰ *Overdue* (${overdueTasks.length})\n${formatTaskList(overdueTasks)}\n\n`
  }

  if (urgentTasks.length > 0) {
    message += `🚨 *Urgent* (${urgentTasks.length})\n${formatTaskList(urgentTasks)}\n\n`
  }

  if (camps.length > 0) {
    message += `🏕️ *Active Code Camps*\n`
    camps.forEach(c => {
      const bar = buildProgressBar(c.progress)
      message += `  • *${c.name}* ${bar} ${c.progress}%\n`
    })
  }

  message += `\n_Tasks: ${doneTasks.length}/${tasks.length} done · ${inProgressTasks.length} in progress_`

  return message
}

function buildProgressBar(pct: number): string {
  const filled = Math.round(pct / 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    // Fall back to DB config
    const supabase = createServiceClient()
    const { data } = await supabase.from('telegram_config').select('bot_token, chat_id').limit(1).single()
    if (!data?.bot_token || !data?.chat_id) {
      return { ok: false, error: 'Telegram not configured' }
    }
    return sendMessage(data.bot_token, data.chat_id, text)
  }

  return sendMessage(token, chatId, text)
}

async function sendMessage(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
  })
  const data = await res.json()
  if (!data.ok) return { ok: false, error: data.description }
  return { ok: true }
}
