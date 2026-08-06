// Branded transactional email templates — colors match DESIGN-COMMISSION.md
// WGI tokens (--wgi-navy #1B2D45, --wgi-bg #F8FAFC, --wgi-border #E2E8F0, etc).
// Email clients don't support CSS variables or most web fonts, so values are
// hardcoded here and the font stack falls back to Arial/sans-serif.

function authEmailShell({ heading, bodyHtml, actionLink, ctaLabel }: {
  heading: string
  bodyHtml: string
  actionLink: string
  ctaLabel: string
}): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:'Raleway',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:4px;overflow:hidden;max-width:480px;">
            <tr>
              <td style="background-color:#1B2D45;padding:20px 32px;">
                <span style="color:#FFFFFF;font-size:16px;font-weight:700;letter-spacing:0.02em;">WYNN GLOBAL 360</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1B2D45;">${heading}</h1>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#1A202C;">${bodyHtml}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:#1B2D45;border-radius:4px;">
                      <a href="${actionLink}" style="display:inline-block;padding:12px 24px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${ctaLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:11px;color:#64748B;">If the button doesn't work, copy this link into your browser:<br><a href="${actionLink}" style="color:#64748B;word-break:break-all;">${actionLink}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;">
                <p style="margin:0;font-size:10px;color:#94A3B8;">Wynn Global 360 — Commission Management</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function renderInviteEmail({ name, actionLink }: { name: string; actionLink: string }): string {
  return authEmailShell({
    heading: `You've been invited, ${name}`,
    bodyHtml: 'An administrator has created an IFA account for you on Wynn Global 360. Set your password to get started.',
    actionLink,
    ctaLabel: 'Accept Invite',
  })
}

export function renderPasswordResetEmail({ actionLink }: { actionLink: string }): string {
  return authEmailShell({
    heading: 'Reset your password',
    bodyHtml: 'This email address already has a Wynn Global 360 account. Use the button below to set a new password and sign in.',
    actionLink,
    ctaLabel: 'Reset Password',
  })
}
