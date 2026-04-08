import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ParsedIntent =
  | { intent: 'addtask'; title: string; priority?: string; campName?: string }
  | { intent: 'addcamp'; campName: string; taskTitle: string }
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
- Add a general task: {"intent":"addtask","title":"<task title>","priority":"low|medium|high|urgent"}
- Add task to a camp: {"intent":"addtask","title":"<task title>","campName":"<camp name>","priority":"low|medium|high|urgent"}
- Add camp then task: {"intent":"addcamp","campName":"<camp name>","taskTitle":"<task title>"}
- Move/update task status: {"intent":"update","taskId":"<first 6 chars of id>","status":"todo|in_progress|in_review|blocked|done"}
- Mark task done: {"intent":"done","taskId":"<first 6 chars of id>"}
- Show standup report: {"intent":"standup"}
- List all tasks: {"intent":"tasks"}
- List all camps: {"intent":"camps"}
- Show help: {"intent":"help"}
- Unclear/chitchat: {"intent":"unknown","reply":"<friendly short reply explaining what the bot can do>"}

Rules:
- If the user wants to add a task and mentions a camp by name, use "addtask" with "campName"
- If no priority is mentioned, default to "medium"
- If the user references a task by partial title (not ID), find the closest match from recent tasks and use its ID
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
