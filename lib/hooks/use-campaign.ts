'use client';

import { useState, useEffect } from 'react';
import type { Campaign } from '@/lib/types';

interface UseCampaignReturn {
  campaign: Campaign | null;
  isLoading: boolean;
}

export function useCampaign(): UseCampaignReturn {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/campaign');
        if (res.ok) {
          const data = (await res.json()) as Campaign;
          setCampaign(data);
        }
      } catch {
        // Silent fail – campaign display is non-critical
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  return { campaign, isLoading };
}
