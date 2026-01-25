import { useState, useCallback, useEffect } from "react";

import {
  get_referral_stats,
  send_referral_invite,
  bulk_send_invites,
  get_pending_invites,
  get_leaderboard,
  type ReferralStats,
  type PendingInvite,
  type LeaderboardEntry,
} from "@/services/api/referrals";
import { use_auth } from "@/contexts/auth_context";

interface UseReferralsReturn {
  stats: ReferralStats | null;
  pending_invites: PendingInvite[];
  leaderboard: LeaderboardEntry[];
  current_user_rank: number | null;
  is_loading: boolean;
  is_sending: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  send_invite: (email: string) => Promise<boolean>;
  send_bulk_invites: (
    emails: string[],
  ) => Promise<{ sent: number; failed: number }>;
  load_leaderboard: () => Promise<void>;
}

export function use_referrals(): UseReferralsReturn {
  const { has_keys } = use_auth();
  const [stats, set_stats] = useState<ReferralStats | null>(null);
  const [pending_invites, set_pending_invites] = useState<PendingInvite[]>([]);
  const [leaderboard, set_leaderboard] = useState<LeaderboardEntry[]>([]);
  const [current_user_rank, set_current_user_rank] = useState<number | null>(
    null,
  );
  const [is_loading, set_is_loading] = useState(true);
  const [is_sending, set_is_sending] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!has_keys) {
      set_is_loading(false);

      return;
    }

    set_is_loading(true);
    set_error(null);

    try {
      const [stats_result, invites_result] = await Promise.all([
        get_referral_stats(),
        get_pending_invites(50),
      ]);

      if (stats_result.data) {
        set_stats(stats_result.data.stats);
      } else if (stats_result.error) {
        set_error(stats_result.error);
      }

      if (invites_result.data) {
        set_pending_invites(invites_result.data.invites);
      }
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : "Failed to load referral data",
      );
    } finally {
      set_is_loading(false);
    }
  }, [has_keys]);

  const send_invite = useCallback(
    async (email: string): Promise<boolean> => {
      set_is_sending(true);
      set_error(null);

      try {
        const result = await send_referral_invite(email);

        if (result.error) {
          set_error(result.error);

          return false;
        }

        await refresh();

        return true;
      } catch (err) {
        set_error(err instanceof Error ? err.message : "Failed to send invite");

        return false;
      } finally {
        set_is_sending(false);
      }
    },
    [refresh],
  );

  const send_bulk = useCallback(
    async (emails: string[]): Promise<{ sent: number; failed: number }> => {
      set_is_sending(true);
      set_error(null);

      try {
        const result = await bulk_send_invites(emails);

        if (result.error) {
          set_error(result.error);

          return { sent: 0, failed: emails.length };
        }

        await refresh();

        return {
          sent: result.data?.sent_count ?? 0,
          failed: result.data?.failed_count ?? 0,
        };
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : "Failed to send invites",
        );

        return { sent: 0, failed: emails.length };
      } finally {
        set_is_sending(false);
      }
    },
    [refresh],
  );

  const load_leaderboard = useCallback(async () => {
    try {
      const result = await get_leaderboard();

      if (result.data) {
        set_leaderboard(result.data.entries);
        set_current_user_rank(result.data.current_user_rank ?? null);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    stats,
    pending_invites,
    leaderboard,
    current_user_rank,
    is_loading,
    is_sending,
    error,
    refresh,
    send_invite,
    send_bulk_invites: send_bulk,
    load_leaderboard,
  };
}
