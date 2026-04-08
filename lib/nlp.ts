import Anthropic from '@anthropic-ai/sdk'

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

export type ParsedIntent =
  | { intent: 'addtask'; title: string; priority?: string; campName?: string; assignedTo?: string }
  | { intent: 'addcamp'; campName: string }
  | { intent: 'update'; taskId: string; status: string }
  | { intent: 'done'; taskId: string }
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
        .slice(0, 10)
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
- Update task status: {"intent":"update","taskId":"<first 6 chars of id>","status":"todo|in_progress|in_review|blocked|done"}
- Mark task done: {"intent":"done","taskId":"<first 6 chars of id>"}
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
- For status updates, map natural language ("move to review", "mark in progress") to the correct enum value
- If the user references a task by partial title, find the closest match from recent tasks and use its ID
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
