import { NextResponse } from 'next/server'
import { sendStandupReport, fetchStandupData, buildStandupPage } from '@/lib/standup'

// POST /api/standup — trigger standup manually or via cronjob
export async function POST() {
  try {
    const result = await sendStandupReport()

    if (!result.ok) {
      console.error('[standup POST] send failed:', result.error)
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[standup POST] error:', err?.message, err?.stack)
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 })
  }
}

// GET /api/standup — preview the standup message (no send)
export async function GET() {
  try {
    const data = await fetchStandupData()
    const { text } = await buildStandupPage(data, 'overview', 0)
    return NextResponse.json({ ok: true, message: text })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
