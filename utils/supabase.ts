import { createBrowserClient } from '@supabase/ssr'

function createNewClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
  )
}

type BrowserClient = ReturnType<typeof createNewClient>
let browserClient: BrowserClient | null = null

export function createClient() {
  // Client components call this during every render. Reuse one browser client
  // so hooks can safely include it in dependency arrays without refetch loops.
  if (!browserClient) {
    browserClient = createNewClient()
  }
  return browserClient
}
