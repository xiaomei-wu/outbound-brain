import { AlertTriangleIcon, Loader2Icon } from 'lucide-react';
import { isIcpActive } from '@/lib/icp/status';
import type { Lead } from '@/lib/types';

/** Per-row progress of the background ICP check and Needle write-back. */
export function IcpStatusChip({ lead }: { lead: Pick<Lead, 'icpStatus' | 'icpStatusAt'> }) {
  if (isIcpActive(lead, new Date())) {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-700 ring-1 ring-sky-200">
        <Loader2Icon className="h-3 w-3 animate-spin" />
        {lead.icpStatus === 'queued' ? 'ICP-Check in Warteschlange' : 'ICP-Check läuft · Sync mit Needle'}
      </span>
    );
  }
  if (lead.icpStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
        <AlertTriangleIcon className="h-3 w-3" />
        ICP-Check fehlgeschlagen
      </span>
    );
  }
  return null;
}
