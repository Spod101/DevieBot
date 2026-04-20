import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendTelegramMessage } from '@/lib/standup'

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Manila'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getTodayInAppTimeZoneISO(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    const fallback = new Date()
    const y = fallback.getFullYear()
    const m = String(fallback.getMonth() + 1).padStart(2, '0')
    const d = String(fallback.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return `${year}-${month}-${day}`
}

function toUTCISODate(d: Date): string {
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysToISODate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  return toUTCISODate(utc)
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
    const todayStr = getTodayInAppTimeZoneISO()
    const tomorrowStr = addDaysToISODate(todayStr, 1)
    const in3Str = addDaysToISODate(todayStr, 3)

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

    const dateStr = new Date().toLocaleDateString('en-PH', {
      timeZone: APP_TIME_ZONE,
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
    const todayStr = getTodayInAppTimeZoneISO()
    const in7Str = addDaysToISODate(todayStr, 7)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, task_number, title, due_date, priority, assigned_to, status')
      .not('due_date', 'is', null)
      .lte('due_date', in7Str)
      .neq('status', 'done')
      .order('due_date', { ascending: true })

    return NextResponse.json({ ok: true, tasks: tasks ?? [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
