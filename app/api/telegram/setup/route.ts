import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

const COMMANDS = [
  { command: 'tasks',   description: 'List active tasks' },
  { command: 'camps',   description: 'List code camps' },
  { command: 'standup', description: 'Send standup report' },
  { command: 'addtask', description: 'Add a task — /addtask <title>' },
  { command: 'addcamp', description: 'Create a camp — /addcamp <name>' },
  { command: 'done',    description: 'Mark task done — /done <id>' },
  { command: 'update',  description: 'Update task status — /update <id> <status>' },
  { command: 'help',    description: 'Show all commands' },
]

async function getToken(): Promise<string | null> {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN
  const supabase = createServiceClient()
  const { data } = await supabase.from('telegram_config').select('bot_token').limit(1).single()
  return data?.bot_token ?? null
}

async function run() {
  const token = await getToken()
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Bot token not configured' }, { status: 500 })
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: COMMANDS }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}

export async function GET() {
  return run()
}

export async function POST() {
  return run()
}
