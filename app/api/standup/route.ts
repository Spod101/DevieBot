import { NextResponse } from 'next/server'
import { generateStandupMessage, sendTelegramMessage } from '@/lib/standup'

// POST /api/standup — trigger standup manually or via cronjob
export async function POST() {
  try {
    const message = await generateStandupMessage()
    const result = await sendTelegramMessage(message)

    if (!result.ok) {
      console.error('[standup POST] sendTelegramMessage failed:', result.error)
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message })
  } catch (err: any) {
    console.error('[standup POST] error:', err?.message, err?.stack)
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 })
  }
}

// GET /api/standup — preview the standup message (no send)
export async function GET() {
  try {
    const message = await generateStandupMessage()
    return NextResponse.json({ ok: true, message })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
