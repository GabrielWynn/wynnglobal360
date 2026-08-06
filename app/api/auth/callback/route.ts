// app/api/auth/callback/route.ts
// Exchanges the PKCE `code` from signInWithOAuth (Azure) for a real session
// server-side, so the session cookie exists before middleware evaluates the
// next request. Without this, redirectTo pointing straight at a protected
// page races the middleware's session check and bounces back to /login.
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/advisors'

  if (code) {
    const supabase = createServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
