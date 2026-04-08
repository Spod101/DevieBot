export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done'
export type CampStatus = 'active' | 'completed' | 'archived' | 'paused'

export interface Tag {
  id: string
  name: string
  color: string
  created_at: string
}

export interface CodeCamp {
  id: string
  name: string
  description: string | null
  status: CampStatus
  progress: number
  start_date: string | null
  end_date: string | null
  resources: Resource[]
  created_at: string
  updated_at: string
}

export interface Resource {
  title: string
  url: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  priority: TaskPriority
  status: TaskStatus
  due_date: string | null
  order_index: number
  camp_id: string | null
  created_at: string
  updated_at: string
  tags?: Tag[]
  comments?: TaskComment[]
}

export interface TaskComment {
  id: string
  task_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface TelegramConfig {
  id: string
  chat_id: string | null
  bot_token: string | null
  standup_time: string
  standup_enabled: boolean
  standup_message_template: string | null
  updated_at: string
}

// Supabase Database type
export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'tags' | 'comments'>
        Update: Partial<Omit<Task, 'id' | 'created_at' | 'updated_at' | 'tags' | 'comments'>>
      }
      code_camps: {
        Row: CodeCamp
        Insert: Omit<CodeCamp, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CodeCamp, 'id' | 'created_at' | 'updated_at'>>
      }
      tags: {
        Row: Tag
        Insert: Omit<Tag, 'id' | 'created_at'>
        Update: Partial<Omit<Tag, 'id' | 'created_at'>>
      }
      task_tags: {
        Row: { task_id: string; tag_id: string }
        Insert: { task_id: string; tag_id: string }
        Update: { task_id?: string; tag_id?: string }
      }
      task_comments: {
        Row: TaskComment
        Insert: Omit<TaskComment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<TaskComment, 'id' | 'created_at' | 'updated_at'>>
      }
      telegram_config: {
        Row: TelegramConfig
        Insert: Omit<TelegramConfig, 'id' | 'updated_at'>
        Update: Partial<Omit<TelegramConfig, 'id' | 'updated_at'>>
      }
    }
  }
}
