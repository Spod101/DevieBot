import Anthropic from '@anthropic-ai/sdk'
import type { TaskStatus } from '@/types/database'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── BulkTask ──────────────────────────────────────────────────────────────────
export type BulkTask = {
  assignee: string
  title: string
  description?: string | null   // supporting notes, context, URLs — preserved verbatim
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string | null       // ISO date YYYY-MM-DD
}

export async function parseBulkTasks(message: string): Promise<BulkTask[]> {
  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = `You are a task extractor for a project management bot.
The user will send text that assigns work to one or more people via @mentions.
Extract every actionable task and return ONLY a JSON array.
Today's date is ${today}.

SUPPORTED MESSAGE FORMATS:
1. Single @mention at top, multiple paragraphs below — each paragraph is a SEPARATE task for that person:
   "@Dale
   Summarize recommendations into slides.

   Action Plan: Present these as actionable items for the team tomorrow.

   Note: Standby on-site. Make sure data is clean."
   → 3 tasks all assigned to "dale"

2. Multiple @mentions inline — one task per mention:
   "@dale fix login @kien review PR"
   → 2 tasks for different people

3. Bullet / numbered lists under a single @mention — each bullet is a separate task.

EXTRACTION RULES:
- "assignee": @username without @, lowercase, first word only if full name (e.g. "Dale Reyes" → "dale")
- "title": concise action (max 70 chars). Strip label prefixes like "Action Plan:", "Note:", "FYI:", "Task:", "Update:"
- "description": any supporting context, details, or URLs within that paragraph BEYOND the main action verb phrase. Preserve URLs verbatim. null if nothing extra.
- "priority": "low"|"medium"|"high"|"urgent" — infer from urgency words, default "medium"
- "dueDate": YYYY-MM-DD if a deadline is mentioned (today, tomorrow, weekday name, "by Friday", "in 3 days"), else null. Apply deadline to all tasks in the same paragraph if mentioned once.
- Strip deadline phrases from title but keep them in dueDate.
- NEVER discard URLs — put them in description if not in title.
- Return ONLY a raw JSON array. No markdown, no explanation.

Example output:
[
  {"assignee":"dale","title":"Summarize recommendations into slides","description":null,"priority":"medium","dueDate":null},
  {"assignee":"dale","title":"Present recommendations as actionable for Mike and Lady","description":"Ensure they are ready for tomorrow's meeting.","priority":"medium","dueDate":"2026-04-14"},
  {"assignee":"kien","title":"Follow up on game plan","description":"https://docs.google.com/...","priority":"medium","dueDate":"2026-04-15"}
]`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
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

// ── BulkUpdate ────────────────────────────────────────────────────────────────
export type BulkUpdate = {
  taskRef: string     // keyword or number, e.g. "login bug" or "23"
  status: TaskStatus
}

/**
 * Extract multiple { taskRef, status } pairs from a message.
 * Handles both structured shorthand and natural language:
 *   structured: "done: login, deploy"  /  "login → done, docs → in review"
 *   natural:    "finished login bug and docs is now in review"
 */
export async function parseBulkUpdates(message: string): Promise<BulkUpdate[]> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: `You extract task status update pairs from a message.
Return ONLY a JSON array of objects with:
- "taskRef": a short keyword or number identifying the task (e.g. "login bug", "deploy app", "23")
- "status": one of: backlog | todo | in_progress | in_review | blocked | done

Map natural language to status values:
- "done" / "finished" / "completed" / "shipped" / "wrapped up" → done
- "working on" / "started" / "in progress" / "wip" / "picking up" → in_progress
- "in review" / "reviewing" / "up for review" / "ready for review" → in_review
- "blocked" / "stuck" / "waiting for" / "held up" → blocked
- "todo" / "not started" / "will do" → todo
- "backlog" / "parked" → backlog

Handle both formats:
- Structured: "done: login bug, deploy app" or "login → done, docs → in review"
- Natural: "finished login bug and docs is now in review"

Return ONLY raw JSON array, no markdown, no explanation.
Example: [{"taskRef":"login bug","status":"done"},{"taskRef":"docs","status":"in_review"}]`,
    messages: [{ role: 'user', content: message }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as BulkUpdate[]
    return []
  } catch {
    return []
  }
}

// ── parseStatus ───────────────────────────────────────────────────────────────
export async function parseStatus(text: string): Promise<TaskStatus | null> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 20,
    system: `Map the following text to exactly one task status enum value.
Return ONLY one of these exact strings with no quotes and no extra words:
  backlog | todo | in_progress | in_review | blocked | done
If the text does not clearly indicate a task status, return exactly: null`,
    messages: [{ role: 'user', content: text }],
  })

  const raw = (response.content[0] as { type: string; text: string }).text.trim()
  const VALID: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done']
  return VALID.includes(raw as TaskStatus) ? (raw as TaskStatus) : null
}

// ── extractDueDate ────────────────────────────────────────────────────────────
// Gate — only call extractDueDate when these keywords are present (checked on URL-stripped text)
export const DEADLINE_KEYWORDS = /\b(by|due|until|before|deadline|tomorrow|tonight|today|next\s+week|next\s+\w+day|in\s+\d+\s+days?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Extract a due date from natural language text.
 * URLs are stripped before deadline detection to prevent false positives.
 * Regex-first for common patterns — Claude fallback for complex phrases.
 */
export async function extractDueDate(text: string): Promise<{ dueDate: string | null; cleanText: string }> {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const todayStr = base.toISOString().split('T')[0]

  // Strip URLs before deadline keyword detection — URLs may contain words like "by", "today", etc.
  const textWithoutUrls = text.replace(/https?:\/\/\S+/g, '')
  if (!DEADLINE_KEYWORDS.test(textWithoutUrls)) {
    return { dueDate: null, cleanText: text }
  }

  const lower = textWithoutUrls.toLowerCase()

  // Helper: strip deadline prepositions + the matched phrase from the ORIGINAL text (preserving URLs).
  // Also removes any dangling preposition left at the end (e.g. "prepare ppt for tomorrow" → "prepare ppt").
  const DANGLING = /\s+\b(by|due|until|before|for|on|at)\b\s*$/i
  const strip = (re: RegExp) =>
    text.replace(new RegExp(`(?:(?:by|due|until|before|for|on|at)\\s+)?${re.source}`, 'gi'), '')
      .replace(DANGLING, '')
      .replace(/\s{2,}/g, ' ').trim()

  // ── today / tonight ──────────────────────────────────────────────────────
  if (/\b(today|tonight)\b/.test(lower)) {
    return { dueDate: todayStr, cleanText: strip(/today|tonight/) }
  }

  // ── tomorrow ─────────────────────────────────────────────────────────────
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(base); d.setDate(d.getDate() + 1)
    return { dueDate: d.toISOString().split('T')[0], cleanText: strip(/tomorrow/) }
  }

  // ── "in N days" ──────────────────────────────────────────────────────────
  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/)
  if (inDays) {
    const d = new Date(base); d.setDate(d.getDate() + parseInt(inDays[1]))
    return {
      dueDate: d.toISOString().split('T')[0],
      cleanText: text.replace(/\bin\s+\d+\s+days?\b/gi, '').replace(DANGLING, '').replace(/\s{2,}/g, ' ').trim(),
    }
  }

  // ── next week ────────────────────────────────────────────────────────────
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(base); d.setDate(d.getDate() + 7)
    return { dueDate: d.toISOString().split('T')[0], cleanText: strip(/next\s+week/) }
  }

  // ── weekday names (next occurrence) ──────────────────────────────────────
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (new RegExp(`\\b${DAY_NAMES[i]}\\b`).test(lower)) {
      const d = new Date(base)
      let diff = i - d.getDay()
      if (diff <= 0) diff += 7
      d.setDate(d.getDate() + diff)
      return {
        dueDate: d.toISOString().split('T')[0],
        cleanText: strip(new RegExp(DAY_NAMES[i])),
      }
    }
  }

  // ── Claude fallback for complex patterns (e.g. "April 20", "end of month") ─
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      system: `Today is ${todayStr}.
Extract any deadline from the text. Return ONLY a JSON object:
- "dueDate": YYYY-MM-DD format, or null
- "cleanText": text with the deadline phrase removed (trimmed), preserving any URLs verbatim
Return ONLY raw JSON, no markdown.`,
      messages: [{ role: 'user', content: text }],
    })
    const raw = (response.content[0] as { type: string; text: string }).text.trim()
    const parsed = JSON.parse(raw)
    const dueDate = typeof parsed.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)
      ? parsed.dueDate : null
    const cleanText = typeof parsed.cleanText === 'string' && parsed.cleanText.trim()
      ? parsed.cleanText.trim() : text
    return { dueDate, cleanText }
  } catch {
    return { dueDate: null, cleanText: text }
  }
}

// ── ParsedIntent ──────────────────────────────────────────────────────────────
export type ParsedIntent =
  | { intent: 'addtask'; title: string; priority?: string; campName?: string; assignedTo?: string; dueDate?: string | null }
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
  context: { camps: string[]; recentTasks: { id: string; title: string; status: string; task_number?: number | null }[] }
): Promise<ParsedIntent> {
  const today = new Date().toISOString().split('T')[0]
  const campsContext = context.camps.length
    ? `Active code camps: ${context.camps.join(', ')}`
    : 'No code camps yet.'

  const tasksContext = context.recentTasks.length
    ? `Recent tasks:\n${context.recentTasks
        .slice(0, 20)
        .map(t => {
          const ref = t.task_number ? `#${t.task_number}` : t.id.slice(0, 6)
          return `- [${ref}] "${t.title}" (${t.status})`
        })
        .join('\n')}`
    : 'No recent tasks.'

  const systemPrompt = `You are the intent parser for Devie, a task management bot.
Extract the user's intent from their message and return ONLY valid JSON.
Today's date is ${today}.

${campsContext}
${tasksContext}

Possible intents and their JSON shapes:
- Add a task: {"intent":"addtask","title":"<task title>","priority":"low|medium|high|urgent","campName":"<camp name or null>","assignedTo":"<username without @ or null>","dueDate":"<YYYY-MM-DD or null>"}
- Create a camp: {"intent":"addcamp","campName":"<camp name>"}
- Update task status: {"intent":"update","taskId":"<first 6 chars of id or null>","status":"backlog|todo|in_progress|in_review|blocked|done"}
- Mark task done: {"intent":"done","taskId":"<first 6 chars of id or null>"}
- Show standup report: {"intent":"standup"}
- List all tasks: {"intent":"tasks"}
- List all camps: {"intent":"camps"}
- Show help: {"intent":"help"}
- Unclear/chitchat: {"intent":"unknown","reply":"<friendly short reply>"}

Rules:
- The user may use slash commands like /addtask, /update, /done as hints — treat them accordingly
- Extract the task title cleanly, stripping out priority/camp/assignee/deadline phrases from it
- If no priority mentioned, default to "medium"
- If no camp mentioned, omit campName or set to null
- If no assignee (@mention) present, omit assignedTo or set to null
- Extract due date from natural language (e.g. "by Friday", "due tomorrow", "in 3 days", "next Monday", "April 20")
  and convert to YYYY-MM-DD format. If no deadline mentioned, set dueDate to null
- For status updates, map natural language to the correct enum value using these patterns:
  * "I'm working on X" / "started X" / "picking up X" / "currently on X" / "wip" → in_progress
  * "reviewing X" / "X is in review" / "up for review" / "submitted for review" / "ready for review" → in_review
  * "blocked on X" / "stuck on X" / "waiting for X" / "can't proceed" / "held up by X" → blocked
  * "done with X" / "finished X" / "completed X" / "wrapped up X" / "shipped X" / "delivered X" → done
  * "haven't started" / "will do X" / "to do" / "planning X" → todo
  * "backlog" / "parked" / "overdue" → backlog
- If the user references a task by partial title OR by number (e.g. "task 23", "#23"), find the closest match from recent tasks and use its UUID's first 6 chars as taskId
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
