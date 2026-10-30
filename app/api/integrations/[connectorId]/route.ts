/**
 * POST /api/integrations/[connectorId]  — save + test a connector's credentials
 * GET  /api/integrations/[connectorId]  — read status (masked key only, never raw credentials)
 */

import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { connectors, maskedKey } from '@/lib/connectors';
import { encrypt, decrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import type { ConnectorId } from '@/lib/types';
import type { IntegrationRow } from '@/lib/mappers';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

function isConnectorId(s: string): s is ConnectorId {
  return s === 'needle' || s === 'ai_ark' || s === 'zapmail';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  if (!isConnectorId(connectorId)) {
    return err('Unbekannter Connector. Bitte Seite neu laden.');
  }

  try {
    const db = getDb();
    const { data } = await db
      .from('integration')
      .select('id, connector_id, status, error_message, last_tested_at, created_at, encrypted_config, iv')
      .eq('connector_id', connectorId)
      .single();

    if (!data) {
      return Response.json({ connectorId, status: 'untested', errorMessage: null, lastTestedAt: null, maskedKey: null });
    }

    const row = data as IntegrationRow;

    // Decrypt to compute the masked key
    let masked: string | null = null;
    try {
      const key = env.ENCRYPTION_KEY();
      const config = JSON.parse(
        decrypt(row.encrypted_config, row.iv, key)
      ) as Record<string, string>;
      masked = maskedKey(config, connectors[connectorId]);
    } catch {
      masked = '****';
    }

    return Response.json({
      connectorId,
      status: row.status,
      errorMessage: row.error_message,
      lastTestedAt: row.last_tested_at,
      maskedKey: masked,
    });
  } catch (e) {
    console.error('[integrations GET]', e);
    return err('Status konnte nicht geladen werden. Bitte Seite neu laden.', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  if (!isConnectorId(connectorId)) {
    return err('Unbekannter Connector. Bitte Seite neu laden.');
  }

  try {
    const body = (await request.json()) as { config?: Record<string, string> };
    const config = body.config;

    if (!config || typeof config !== 'object') {
      return err('Ungültige Eingabe. Bitte Zugangsdaten eingeben und erneut versuchen.');
    }

    const connector = connectors[connectorId];

    // Validate required fields
    for (const field of connector.fields) {
      if (!config[field.name]?.trim()) {
        return err(`${field.label} darf nicht leer sein. Bitte ausfüllen.`);
      }
    }

    // Encrypt and upsert to DB
    const encryptionKey = env.ENCRYPTION_KEY();
    const { encrypted, iv } = encrypt(JSON.stringify(config), encryptionKey);

    const db = getDb();
    const { error: upsertError } = await db.from('integration').upsert(
      {
        connector_id: connectorId,
        encrypted_config: encrypted,
        iv,
        status: 'untested',
        error_message: null,
      },
      { onConflict: 'connector_id' }
    );

    if (upsertError) {
      console.error('[integrations POST] upsert:', upsertError);
      return err('Zugangsdaten konnten nicht gespeichert werden. Bitte erneut versuchen.', 500);
    }

    // Run connectivity test
    const testResult = await connector.test(config);
    const now = new Date().toISOString();

    // Update status in DB
    await db
      .from('integration')
      .update({
        status: testResult.ok ? 'ok' : 'failed',
        error_message: testResult.ok ? null : testResult.message,
        last_tested_at: now,
      })
      .eq('connector_id', connectorId);

    return Response.json({
      status: testResult.ok ? 'ok' : 'failed',
      message: testResult.message,
    });
  } catch (e) {
    console.error('[integrations POST]', e);
    return err('Verbindungstest fehlgeschlagen. Bitte Zugangsdaten prüfen und erneut versuchen.', 500);
  }
}

// Also handle DELETE to remove a connector's credentials
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  if (!isConnectorId(connectorId)) {
    return err('Unbekannter Connector.');
  }

  try {
    const db = getDb();
    await db.from('integration').delete().eq('connector_id', connectorId);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[integrations DELETE]', e);
    return err('Zugangsdaten konnten nicht gelöscht werden.', 500);
  }
}
