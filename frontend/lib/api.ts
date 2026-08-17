import { createSupabaseClient } from './supabase/client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  const headers = new Headers(options.headers || {})
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  // Ensure endpoint starts with a slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${BACKEND_URL.replace(/\/$/, '')}${cleanEndpoint}`

  return fetch(url, {
    ...options,
    headers
  })
}
