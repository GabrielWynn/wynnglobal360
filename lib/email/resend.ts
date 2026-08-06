import { Resend } from 'resend'

let client: Resend | null = null

export function getResendClient(): Resend {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

// Sandbox default until wynnglobal360.com is verified in Resend — onboarding@resend.dev
// only delivers to the Resend account's own email, not arbitrary IFA addresses.
export const EMAIL_FROM = `Wynn Global 360 <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`
