import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST() {
  try {
    const supabase = createServiceClient()
    const { data: cfg } = await supabase
      .from('telegram_config')
      .select('bot_token')
      .limit(1)
      .single()

    const token = process.env.TELEGRAM_BOT_TOKEN ?? cfg?.bot_token
    if (!token) return NextResponse.json({ ok: false, error: 'Bot token not configured' })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    if (!appUrl) return NextResponse.json({ ok: false, error: 'NEXT_PUBLIC_APP_URL not set' })

    const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'callback_query', 'chat_member', 'my_chat_member'] }),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
