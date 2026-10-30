/**
 * GET /api/status  — health check for all services
 */

import { getDb } from '@/lib/db';
import { getCredentials } from '@/lib/connectors';
import { env } from '@/lib/env';

interface ServiceStatus {
  name: string;
  status: 'ok' | 'error';
  message: string;
}

export async function GET() {
  const services: ServiceStatus[] = [];

  // 1. Database — simple select
  try {
    const db = getDb();
    const { error } = await db.from('campaign').select('id').limit(1);
    if (error) throw error;
    services.push({ name: 'Datenbank', status: 'ok', message: 'Verbunden' });
  } catch (e) {
    console.error('[status] db check failed:', e);
    services.push({
      name: 'Datenbank',
      status: 'error',
      message: 'Verbindung zur Datenbank nicht möglich. Admin informieren.',
    });
  }

  // 2. Claude AI — check that the API key is set (no API call to save credits)
  try {
    const key = env.ANTHROPIC_API_KEY();
    if (!key) throw new Error('missing key');
    services.push({ name: 'Claude AI', status: 'ok', message: 'API-Schlüssel konfiguriert' });
  } catch {
    services.push({
      name: 'Claude AI',
      status: 'error',
      message: 'ANTHROPIC_API_KEY fehlt — bitte Xiaomei per Slack kontaktieren.',
    });
  }

  // 3. Slack webhook — check URL is set
  try {
    const url = env.SLACK_WEBHOOK_URL();
    if (!url) throw new Error('not set');
    services.push({ name: 'Slack', status: 'ok', message: 'Webhook konfiguriert' });
  } catch {
    services.push({
      name: 'Slack',
      status: 'error',
      message: 'Slack-Webhook nicht gesetzt — Briefings erscheinen nicht in Slack.',
    });
  }

  // 4. Needle
  try {
    const creds = await getCredentials('needle');
    if (!creds) throw new Error('not configured');
    services.push({
      name: 'Needle',
      status: 'ok',
      message: 'Schlüssel über Integrations-Seite konfiguriert',
    });
  } catch {
    services.push({
      name: 'Needle',
      status: 'error',
      message: 'Kein Needle-Schlüssel — bitte auf der Integrations-Seite einfügen.',
    });
  }

  // 5. AI Ark
  try {
    const creds = await getCredentials('ai_ark');
    if (!creds) throw new Error('not configured');
    services.push({
      name: 'AI Ark',
      status: 'ok',
      message: 'Schlüssel über Integrations-Seite konfiguriert',
    });
  } catch {
    services.push({
      name: 'AI Ark',
      status: 'error',
      message: 'Kein AI-Ark-Schlüssel — bitte auf der Integrations-Seite einfügen.',
    });
  }

  // 6. Zapmail
  try {
    const creds = await getCredentials('zapmail');
    if (!creds) throw new Error('not configured');
    services.push({
      name: 'Zapmail',
      status: 'ok',
      message: 'Zugangsdaten konfiguriert',
    });
  } catch {
    services.push({
      name: 'Zapmail',
      status: 'error',
      message: 'Zapmail nicht konfiguriert — SMTP- und IMAP-URL auf der Integrations-Seite einfügen.',
    });
  }

  return Response.json({ services });
}
