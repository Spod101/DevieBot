import { createServiceClient } from '@/lib/supabase/service'
import type { Task, CodeCamp } from '@/types/database'

// Q2 deadline: June 30 of the current year
function getQ2Deadline(from: Date): number {
  const q2End = new Date(from.getFullYear(), 5, 30) // June 30
  if (q2End < from) {
    // already past Q2, use next year's
    q2End.setFullYear(from.getFullYear() + 1)
  }
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.ceil((q2End.getTime() - from.getTime()) / msPerDay)
}

// Pick status icon based on camp state and proximity of start_date
function campIcon(camp: CodeCamp, today: Date): string {
  if (camp.status === 'completed') return '✅'
  if (camp.status === 'paused') return '⏸'
  if (camp.status === 'archived') return '📦'
  if (!camp.start_date) return '🚀' // TBC / no date set
  const start = new Date(camp.start_date)
  const daysAway = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (daysAway <= 14) return '🟢'  // very soon
  if (daysAway <= 60) return '📌'  // confirmed, upcoming
  return '🚀'                       // far out / TBC
}

// Format camp start_date into human-readable form
function formatCampDate(camp: CodeCamp): string {
  if (!camp.start_date) return 'TBC'
  const d = new Date(camp.start_date)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Parse description for venue and contact separated by " | "
// e.g. "Bukidnon State University | Zhi (chapter contact)"
function parseDescription(desc: string | null): { venue: string | null; contact: string | null } {
  if (!desc) return { venue: null, contact: null }
  const parts = desc.split('|').map(s => s.trim())
  return { venue: parts[0] || null, contact: parts[1] || null }
}

export async function generateStandupMessage(): Promise<string> {
  const supabase = createServiceClient()

  const [tasksRes, campsRes] = await Promise.all([
    supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
    supabase.from('code_camps').select('*').order('start_date', { ascending: true, nullsFirst: false }),
  ])

  const tasks: Task[] = tasksRes.data || []
  const allCamps: CodeCamp[] = campsRes.data || []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // KPI metrics
  const completedCamps = allCamps.filter(c => c.status === 'completed').length
  const totalCamps = allCamps.length
  const openRisks = tasks.filter(t => t.status === 'blocked' || t.priority === 'urgent' && t.status !== 'done').length
  const daysToQ2 = getQ2Deadline(today)

  // Upcoming camps: active + paused, sorted by start_date
  const upcomingCamps = allCamps.filter(c => c.status === 'active' || c.status === 'paused')

  const date = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  let msg = `📝 *DEVCON OPS — DAILY DSU*\n`
  msg += `${date}\n\n`

  msg += `📊 *KPI SNAPSHOT*\n`
  msg += `Code Camps: *${completedCamps}/${totalCamps} completed*\n`
  msg += `Days to Q2 deadline: *${daysToQ2} days*\n`
  msg += `Open Risks: *${openRisks}*\n\n`

  if (upcomingCamps.length > 0) {
    msg += `📅 *UPCOMING CAMPS*\n`
    upcomingCamps.forEach(camp => {
      const icon = campIcon(camp, today)
      const dateStr = formatCampDate(camp)
      msg += `${icon} *${camp.name}* — ${dateStr}\n`

      const { venue, contact } = parseDescription(camp.description)
      const venuePart = venue ? `📍 ${venue}` : null
      const contactPart = contact ? `👤 ${contact}` : null
      const subLine = [venuePart, contactPart].filter(Boolean).join(' · ')
      if (subLine) msg += `   ${subLine}\n`
    })
  }

  return msg.trimEnd()
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
