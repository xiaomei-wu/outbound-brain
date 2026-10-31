import { PhoneIcon, PhoneOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhoneBadgeProps {
  phone: string | null;
  source: string | null;
  dnc: boolean;
  className?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  ai_ark: 'AI Ark',
  lusha: 'Lusha',
  blitz: 'BlitzAPI',
  manuell: 'manuell',
};

/** Marks leads that have a phone number (green) or only a do-not-call number (red). */
export function PhoneBadge({ phone, source, dnc, className }: PhoneBadgeProps) {
  if (!phone) return null;

  if (dnc) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 ring-1 ring-red-200',
          className,
        )}
      >
        <PhoneOffIcon className="h-3 w-3" />
        Nicht anrufen
      </span>
    );
  }

  const label = source ? SOURCE_LABEL[source] ?? source : null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
        className,
      )}
    >
      <PhoneIcon className="h-3 w-3" />
      Nummer{label ? ` · ${label}` : ''}
    </span>
  );
}
