import { z } from 'zod';
import { getDb } from '@/lib/db';

const PhoneBody = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()/-]{6,25}$/, 'invalid phone'),
});

/** POST /api/leads/[id]/phone — sets the lead's phone number entered by the seller. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = PhoneBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Bitte eine gültige Telefonnummer eingeben, z. B. +49 30 1234567.' },
      { status: 400 },
    );
  }

  const { error } = await getDb()
    .from('lead')
    .update({ phone: parsed.data.phone, phone_source: 'manuell', phone_dnc: false })
    .eq('id', id);
  if (error) {
    console.error('[phone POST]', error);
    return Response.json(
      { error: 'Telefonnummer konnte nicht gespeichert werden. Bitte erneut versuchen.' },
      { status: 500 },
    );
  }
  return Response.json({ phone: parsed.data.phone });
}
