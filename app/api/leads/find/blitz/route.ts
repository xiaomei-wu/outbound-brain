/**
 * POST /api/leads/find/blitz
 *
 * Searches BlitzAPI for German real-estate companies + decision-makers and
 * inserts any new leads into the database.
 *
 * Body (optional): { limit?: number }
 *   limit — number of companies to fetch (default 5, max 20). Each company
 *           yields up to 2 employee leads.
 *
 * Response: { created: number; skipped: number; message: string }
 *
 * Returns 400 when BlitzAPI is not connected.
 * Returns 200 on partial success (some inserts failed) — `message` explains.
 */

import { getDb } from '@/lib/db';
import { getCredentials } from '@/lib/connectors';
import { blitzSearchCompanies, blitzFindEmployees, mapBlitzPerson } from '@/lib/blitz';

import { after } from 'next/server';
import { scheduleIcpChecks } from '@/lib/icp/schedule';

function err(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

const DEFAULT_COMPANIES = 5;
const PEOPLE_PER_COMPANY = 2;
const MAX_COMPANIES = 20;

export async function POST(request: Request) {
  // Resolve BlitzAPI credentials
  const creds = await getCredentials('blitz');
  if (!creds?.apiKey) {
    return err('BlitzAPI ist nicht verbunden.');
  }
  const { apiKey } = creds;

  // Parse body
  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const companyLimit = Math.min(
    typeof body.limit === 'number' && body.limit > 0 ? body.limit : DEFAULT_COMPANIES,
    MAX_COMPANIES
  );

  const db = getDb();

  let created = 0;
  let skipped = 0;
  const newLeadIds: string[] = [];

  try {
    // Fetch real-estate companies from BlitzAPI
    const { companies } = await blitzSearchCompanies(apiKey, { maxResults: companyLimit });

    for (const company of companies) {
      // Only search employees when the company has a LinkedIn URL
      if (!company.linkedin_url) {
        skipped++;
        continue;
      }

      let people;
      try {
        people = await blitzFindEmployees(apiKey, company.linkedin_url, PEOPLE_PER_COMPANY);
      } catch {
        // Skip this company if the employee lookup fails (e.g. rate limit)
        skipped++;
        continue;
      }

      for (const person of people) {
        if (!person.linkedin_url) {
          skipped++;
          continue;
        }

        // Dedup: skip leads with the same LinkedIn profile URL
        const { data: existing } = await db
          .from('lead')
          .select('id')
          .eq('profile_url', person.linkedin_url)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const row = mapBlitzPerson(person, company);

        const { data: inserted, error } = await db
          .from('lead')
          .insert(row)
          .select('id')
          .single();

        if (!error && inserted) {
          created++;
          newLeadIds.push((inserted as { id: string }).id);
        } else {
          skipped++;
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
    return Response.json({ error: msg }, { status: 502 });
  }

  if (newLeadIds.length > 0) after(() => scheduleIcpChecks(newLeadIds));

  const message =
    created > 0
      ? `${created} neue Lead${created === 1 ? '' : 's'} importiert, ${skipped} übersprungen.`
      : `Keine neuen Leads — ${skipped} übersprungen (bereits vorhanden oder kein Profil).`;

  return Response.json({ created, skipped, message });
}
