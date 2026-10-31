/**
 * POST /api/leads/[id]/phone-lookup
 * Two-step Lusha phone lookup (search → reveal). Lusha is the last resort: the UI only
 * offers it after POST /api/leads/[id]/phone-lookup/chain (AI Ark, BlitzAPI) found nothing.
 *
 * Body: { step: 'search' | 'reveal', lushaId?: string }
 *
 * search response: { found: boolean; lushaId?: string; credits?: number|null; message: string }
 * reveal response: { phone?: string; dnc?: boolean; message: string }
 */

import { getDb } from '@/lib/db';
import { getCredentials } from '@/lib/connectors';
import { lushaContactInput, lushaSearch, lushaRevealPhones, pickPhone } from '@/lib/lusha';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    step?: string;
    lushaId?: string;
  } | null;

  if (!body?.step || !['search', 'reveal'].includes(body.step)) {
    return Response.json(
      { error: 'Ungültige Anfrage. Bitte „step" angeben: search oder reveal.' },
      { status: 400 },
    );
  }

  const db = getDb();

  // Load the lead
  const { data: leadRow, error: leadErr } = await db
    .from('lead')
    .select('id, name, profile_url, company_domain, company, region, phone')
    .eq('id', id)
    .single();

  if (leadErr || !leadRow) {
    return Response.json({ error: 'Lead nicht gefunden.' }, { status: 404 });
  }

  const lead = leadRow as {
    id: string;
    name: string;
    profile_url: string | null;
    company_domain: string | null;
    company: string | null;
    region: string | null;
    phone: string | null;
  };

  // Try Lusha credentials first
  const lushaCreds = await getCredentials('lusha');
  const lushaKey = lushaCreds?.['apiKey'] ?? null;

  // -------------------------------------------------------------------------
  // Step: search
  // -------------------------------------------------------------------------

  if (body.step === 'search') {
    if (!lushaKey) {
      return Response.json(
        {
          found: false,
          message:
            'Lusha ist nicht verbunden. Bitte auf der Integrations-Seite einen API-Schlüssel hinterlegen.',
        },
        { status: 400 },
      );
    }

    // Lusha search
    try {
      const input = lushaContactInput({
        name: lead.name,
        profileUrl: lead.profile_url,
        companyDomain: lead.company_domain,
        company: lead.company,
      });
      if (!input) {
        return Response.json({
          found: false,
          message: 'Für Lusha fehlt ein LinkedIn-Profil oder Vor- und Nachname plus Firma.',
        });
      }
      const result = await lushaSearch(lushaKey, input);

      if (!result) {
        return Response.json({
          found: false,
          message: 'Lusha hat keinen passenden Kontakt gefunden.',
        });
      }

      const creditsMsg =
        result.phoneCredits != null
          ? `≈ ${result.phoneCredits} Credits`
          : 'Kosten unbekannt';

      return Response.json({
        found: true,
        lushaId: result.id,
        credits: result.phoneCredits,
        message: `Lusha hat eine Nummer (${creditsMsg}) — aufdecken?`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[phone-lookup search]', msg);
      return Response.json({ found: false, message: msg }, { status: 502 });
    }
  }

  // -------------------------------------------------------------------------
  // Step: reveal
  // -------------------------------------------------------------------------

  if (!lushaKey) {
    return Response.json(
      { error: 'Lusha ist nicht verbunden.' },
      { status: 400 },
    );
  }

  const lushaId = body.lushaId;
  if (!lushaId) {
    return Response.json(
      { error: 'lushaId fehlt. Bitte zuerst „search" ausführen.' },
      { status: 400 },
    );
  }

  try {
    const phonesOrJob = await lushaRevealPhones(lushaKey, lushaId);

    // Still async (shouldn't happen after polling, but handle gracefully)
    if (!Array.isArray(phonesOrJob)) {
      return Response.json({
        message: 'Lusha liefert noch — später erneut versuchen.',
      });
    }

    const picked = pickPhone(phonesOrJob);

    if (picked === null) {
      return Response.json({
        message: 'Lusha hat keine Telefonnummer für diesen Kontakt.',
      });
    }

    if ('allDnc' in picked) {
      const firstDnc = phonesOrJob[0];
      if (firstDnc) {
        await db
          .from('lead')
          .update({ phone: firstDnc.number, phone_source: 'lusha', phone_dnc: true })
          .eq('id', id);
      }
      return Response.json({
        dnc: true,
        message:
          'Nur Nummern mit Nicht-anrufen-Kennzeichen — diese Person darf nicht kontaktiert werden.',
      });
    }

    // Save the number (no DNC)
    const { error: saveErr } = await db
      .from('lead')
      .update({
        phone: picked.number,
        phone_source: 'lusha',
        phone_dnc: false,
      })
      .eq('id', id);

    if (saveErr) {
      console.error('[phone-lookup reveal save]', saveErr);
      return Response.json(
        { error: 'Nummer konnte nicht gespeichert werden. Bitte erneut versuchen.' },
        { status: 500 },
      );
    }

    return Response.json({
      phone: picked.number,
      message: `Nummer gefunden (${picked.type}): ${picked.number}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[phone-lookup reveal]', msg);
    return Response.json({ message: msg }, { status: 502 });
  }
}
