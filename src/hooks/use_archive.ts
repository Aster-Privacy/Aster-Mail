import { useState, useCallback, useEffect } from "react";

import { MAIL_EVENTS, emit_mail_changed } from "./mail_events";

import {
  get_archive_stats,
  batch_archive,
  batch_unarchive,
  promote_archive_tier,
  type ArchiveStatsResponse,
  type ArchiveTierStats,
} from "@/services/api/archive";
import { format_bytes } from "@/lib/utils";

interface UseArchiveReturn {
  stats: ArchiveStatsResponse | null;
  is_loading: boolean;
  error: string | null;
  fetch_stats: () => Promise<void>;
  archive_items: (ids: string[], tier?: string) => Promise<boolean>;
  unarchive_items: (ids: string[]) => Promise<boolean>;
  promote_tier: (
    from_tier: string,
    to_tier: string,
    days_old?: number,
  ) => Promise<number>;
  get_tier_label: (tier: string) => string;
  get_tier_color: (tier: string) => string;
}

const TIER_LABELS: Record<string, string> = {
  hot: "Recently Archived",
  warm: "Older Items",
  cold: "Long-term Archive",
};

const TIER_COLORS: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cold: "#3b82f6",
};

export function use_archive(): UseArchiveReturn {
  const [stats, set_stats] = useState<ArchiveStatsResponse | null>(null);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const fetch_stats = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    try {
      const response = await get_archive_stats();

      if (response.data) {
        set_stats(response.data);
      } else if (response.error) {
        set_error(response.error);
      }
    } catch {
      set_error("Failed to fetch archive stats");
    } finally {
      set_is_loading(false);
    }
  }, []);

  const archive_items = useCallback(
    async (ids: string[], tier = "hot"): Promise<boolean> => {
      try {
        const response = await batch_archive({ ids, tier });

        if (response.data?.success) {
          emit_mail_changed();
          fetch_stats();

          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [fetch_stats],
  );

  const unarchive_items = useCallback(
    async (ids: string[]): Promise<boolean> => {
      try {
        const response = await batch_unarchive({ ids });

        if (response.data?.success) {
          emit_mail_changed();
          fetch_stats();

          return true;
        }

        return false;
      } catch {
        return false;
      }
    },
    [fetch_stats],
  );

  const promote_tier = useCallback(
    async (
      from_tier: string,
      to_tier: string,
      days_old = 90,
    ): Promise<number> => {
      try {
        const response = await promote_archive_tier({
          from_tier,
          to_tier,
          days_old,
        });

        if (response.data?.success) {
          fetch_stats();

          return response.data.promoted_count;
        }

        return 0;
      } catch {
        return 0;
      }
    },
    [fetch_stats],
  );

  const get_tier_label = useCallback((tier: string): string => {
    return TIER_LABELS[tier] || tier;
  }, []);

  const get_tier_color = useCallback((tier: string): string => {
    return TIER_COLORS[tier] || "#6b7280";
  }, []);

  useEffect(() => {
    const handler = () => {
      fetch_stats();
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handler);

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handler);
    };
  }, [fetch_stats]);

  return {
    stats,
    is_loading,
    error,
    fetch_stats,
    archive_items,
    unarchive_items,
    promote_tier,
    get_tier_label,
    get_tier_color,
  };
}

export { format_bytes as format_archive_size };

export type { ArchiveStatsResponse, ArchiveTierStats };
