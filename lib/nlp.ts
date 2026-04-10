import Anthropic from '@anthropic-ai/sdk'
import type { TaskStatus } from '@/types/database'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type BulkTask = {
  assignee: string
  title: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export async function parseBulkTasks(message: string): Promise<BulkTask[]> {
  const systemPrompt = `You are a task extractor for a project management bot.
The user will send a block of text that assigns tasks to people using @mentions.
Extract every actionable task for each person and return ONLY a JSON array.

Each item in the array must have:
- "assignee": the @username (without the @ symbol, lowercase, no spaces — use the first word of the name if it's a full name)
- "title": a concise task title (max ~60 chars)
- "priority": "low" | "medium" | "high" | "urgent" (infer from urgency words; default "medium")

Rules:
- One bullet point or sentence = one task
- If a person has multiple tasks, produce multiple entries for them
- Ignore conversational filler, only extract clear action items
- Always return ONLY a raw JSON array, no markdown, no explanation

Example output:
[
  {"assignee":"dale","title":"Summarize recommendations into slides","priority":"high"},
  {"assignee":"kien","title":"Follow up on game plan for March 28 post-event content","priority":"medium"}
]`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()

  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as BulkTask[]
    return []
  } catch {
    return []
  }
}

export async function parseStatus(text: string): Promise<TaskStatus | null> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 20,
    system: `Map the following text to exactly one task status enum value.
Return ONLY one of these exact strings with no quotes and no extra words:
  todo | in_progress | in_review | blocked | done
If the text does not clearly indicate a task status, return exactly: null`,
    messages: [{ role: 'user', content: text }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()
  const VALID: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done']
  return VALID.includes(raw as TaskStatus) ? (raw as TaskStatus) : null
}

// ── ParsedIntent ─────────────────────────────────────────────────────────────
export type ParsedIntent =
  | { intent: 'addtask'; title: string; priority?: string; campName?: string; assignedTo?: string }
  | { intent: 'addcamp'; campName: string }
  | { intent: 'update'; taskId: string | null; status: string }
  | { intent: 'done';   taskId: string | null }
  | { intent: 'standup' }
  | { intent: 'tasks' }
  | { intent: 'camps' }
  | { intent: 'help' }
  | { intent: 'unknown'; reply: string }

export async function parseMessage(
  message: string,
  context: { camps: string[]; recentTasks: { id: string; title: string; status: string }[] }
): Promise<ParsedIntent> {
  const campsContext = context.camps.length
    ? `Active code camps: ${context.camps.join(', ')}`
    : 'No code camps yet.'

  const tasksContext = context.recentTasks.length
    ? `Recent tasks:\n${context.recentTasks
        .slice(0, 20)
        .map(t => `- [${t.id.slice(0, 6)}] "${t.title}" (${t.status})`)
        .join('\n')}`
    : 'No recent tasks.'

  const systemPrompt = `You are the intent parser for Devie, a task management bot.
Extract the user's intent from their message and return ONLY valid JSON.

${campsContext}
${tasksContext}

Possible intents and their JSON shapes:
- Add a task: {"intent":"addtask","title":"<task title>","priority":"low|medium|high|urgent","campName":"<camp name or null>","assignedTo":"<username without @ or null>"}
- Create a camp: {"intent":"addcamp","campName":"<camp name>"}
- Update task status: {"intent":"update","taskId":"<first 6 chars of id or null>","status":"todo|in_progress|in_review|blocked|done"}
- Mark task done: {"intent":"done","taskId":"<first 6 chars of id or null>"}
- Show standup report: {"intent":"standup"}
- List all tasks: {"intent":"tasks"}
- List all camps: {"intent":"camps"}
- Show help: {"intent":"help"}
- Unclear/chitchat: {"intent":"unknown","reply":"<friendly short reply>"}

Rules:
- The user may use slash commands like /addtask, /update, /done as hints — treat them accordingly
- Extract the task title cleanly, stripping out priority/camp/assignee mentions from it
- If no priority mentioned, default to "medium"
- If no camp mentioned, omit campName or set to null
- If no assignee (@mention) present, omit assignedTo or set to null
- For status updates, map natural language to the correct enum value using these patterns:
  * "I'm working on X" / "started X" / "picking up X" / "currently on X" / "wip" → in_progress
  * "reviewing X" / "X is in review" / "up for review" / "submitted for review" / "ready for review" → in_review
  * "blocked on X" / "stuck on X" / "waiting for X" / "can't proceed" / "held up by X" → blocked
  * "done with X" / "finished X" / "completed X" / "wrapped up X" / "shipped X" / "delivered X" → done
  * "haven't started" / "will do X" / "to do" / "planning X" → todo
- If the user references a task by partial title, find the closest match from recent tasks and use its ID
- If the intent is clearly a status update but no task title matches recent tasks, still return the update intent with taskId set to null
- Only use intent:"unknown" for genuine chitchat with zero task/project relevance
- Always return ONLY raw JSON, no markdown, no explanation`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: 'user', content: message }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()

  try {
    return JSON.parse(raw) as ParsedIntent
  } catch {
    return { intent: 'unknown', reply: "I didn't quite understand that. Try /help to see what I can do." }
  }
}
