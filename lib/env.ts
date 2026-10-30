// Central env access. Read env only through this module; values are read lazily so a
// missing optional key never breaks the build.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // Core (always required)
  ANTHROPIC_API_KEY:      () => required('ANTHROPIC_API_KEY'),
  SUPABASE_URL:           () => required('SUPABASE_URL'),
  SUPABASE_SERVICE_KEY:   () => required('SUPABASE_SERVICE_ROLE_KEY'),
  SLACK_WEBHOOK_URL:      () => required('SLACK_WEBHOOK_URL'),
  ENCRYPTION_KEY:         () => required('ENCRYPTION_KEY'),
  APP_URL:                () => required('NEXT_PUBLIC_APP_URL'),
  EVENTS_WEBHOOK_SECRET:  () => required('EVENTS_WEBHOOK_SECRET'),
  FIXED_MEETING_SLOTS:    () => optional('FIXED_MEETING_SLOTS') ?? 'Thu 14:00,Fri 10:00',
  TEAM_INBOXES:           () => optional('TEAM_INBOXES') ?? '',

  // Partner keys (fallbacks when not set via Integrations page)
  NEEDLE_API_KEY:         () => optional('NEEDLE_API_KEY'),
  NEEDLE_WEBHOOK_SECRET:  () => optional('NEEDLE_WEBHOOK_SECRET'),
  AI_ARK_API_KEY:         () => optional('AI_ARK_API_KEY'),
  ZAPMAIL_SMTP_URL:       () => optional('ZAPMAIL_SMTP_URL'),
  ZAPMAIL_IMAP_URL:       () => optional('ZAPMAIL_IMAP_URL'),
} as const;
