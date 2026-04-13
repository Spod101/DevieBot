import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendTelegramMessage } from '@/lib/standup'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * POST /api/telegram/deadlines
 * Sends a deadline digest to the configured Telegram chat.
 * Call this from a cron job (e.g. daily at 08:00 Manila time).
 *
 * GET /api/telegram/deadlines
 * Returns deadline data as JSON (for debugging / manual checks).
 */
export async function POST() {
  try {
    const supabase = createServiceClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    const in3days = new Date(today)
    in3days.setDate(today.getDate() + 3)
    const in3Str = in3days.toISOString().split('T')[0]

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, task_number, title, due_date, priority, assigned_to, status')
      .not('due_date', 'is', null)
      .lte('due_date', in3Str)
      .neq('status', 'done')
      .order('due_date', { ascending: true })
      .limit(30)

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ ok: true, message: 'No upcoming deadlines, nothing sent.' })
    }

    const overdue   = tasks.filter((t: any) => t.due_date < todayStr)
    const dueToday  = tasks.filter((t: any) => t.due_date === todayStr)
    const dueTomorrow = tasks.filter((t: any) => t.due_date === tomorrowStr)
    const dueSoon   = tasks.filter((t: any) => t.due_date > tomorrowStr && t.due_date <= in3Str)

    if (overdue.length === 0 && dueToday.length === 0 && dueTomorrow.length === 0 && dueSoon.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nothing to report.' })
    }

    function taskLine(t: any): string {
      const code = t.task_number ? `T-${String(t.task_number).padStart(3, '0')}` : t.id.slice(0, 6)
      const assignee = t.assigned_to ? ` — ${esc(t.assigned_to)}` : ''
      const badge = t.priority === 'urgent' ? ' 🔴' : t.priority === 'high' ? ' 🟠' : ''
      return `• <code>${code}</code> ${esc(t.title)}${badge}${assignee}`
    }

    const dateStr = today.toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila',
      weekday: 'long', month: 'long', day: 'numeric',
    })

    let msg = `⏰ <b>Deadline Digest</b> — ${esc(dateStr)}\n`

    if (overdue.length > 0) {
      msg += `\n🔴 <b>Overdue (${overdue.length})</b>\n`
      overdue.forEach((t: any) => { msg += taskLine(t) + '\n' })
    }
    if (dueToday.length > 0) {
      msg += `\n🟠 <b>Due Today (${dueToday.length})</b>\n`
      dueToday.forEach((t: any) => { msg += taskLine(t) + '\n' })
    }
    if (dueTomorrow.length > 0) {
      msg += `\n🟡 <b>Due Tomorrow (${dueTomorrow.length})</b>\n`
      dueTomorrow.forEach((t: any) => { msg += taskLine(t) + '\n' })
    }
    if (dueSoon.length > 0) {
      msg += `\n📌 <b>Due in 2–3 Days (${dueSoon.length})</b>\n`
      dueSoon.forEach((t: any) => { msg += taskLine(t) + '\n' })
    }

    msg += `\n<i>Use /done &lt;id&gt; to mark complete · /deadlines for full list</i>`

    const result = await sendTelegramMessage(msg)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sent: tasks.length })
  } catch (err: any) {
    console.error('[deadlines] error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createServiceClient()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in7days = new Date(today)
    in7days.setDate(today.getDate() + 7)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, task_number, title, due_date, priority, assigned_to, status')
      .not('due_date', 'is', null)
      .lte('due_date', in7days.toISOString().split('T')[0])
      .neq('status', 'done')
      .order('due_date', { ascending: true })

    return NextResponse.json({ ok: true, tasks: tasks ?? [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
