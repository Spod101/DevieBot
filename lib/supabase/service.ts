import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Service role client — only for server-side API routes (Telegram webhook, standup)
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
