import { createClient } from '@supabase/supabase-js'

// Service role client — only for server-side API routes (Telegram webhook, standup)
// Untyped intentionally: our interface types don't satisfy Supabase's GenericTable constraint
export function createServiceClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
