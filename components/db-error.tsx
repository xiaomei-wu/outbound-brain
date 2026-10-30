import Link from 'next/link';
import { TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Shown instead of data when the database cannot be read. Never falls back to fake data. */
export function DbError() {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Datenbank nicht erreichbar</AlertTitle>
        <AlertDescription>
          Die Leads konnten nicht geladen werden. Öffne die{' '}
          <Link href="/status" className="underline">
            Status-Seite
          </Link>{' '}
          und prüfe die Zeile „Datenbank“. Wenn sie rot ist, melde dich bei Xiaomei auf Slack.
        </AlertDescription>
      </Alert>
    </div>
  );
}
