import { useState, useCallback, useEffect } from "react";

import {
  list_subscriptions,
  bulk_unsubscribe,
  scan_subscriptions,
  get_subscription_stats,
  type Subscription,
  type SubscriptionCategory,
  type SubscriptionStats,
  type ListSubscriptionsParams,
} from "@/services/api/subscriptions";

interface UseSubscriptionsOptions {
  auto_fetch?: boolean;
  limit?: number;
}

interface UseSubscriptionsReturn {
  subscriptions: Subscription[];
  stats: SubscriptionStats | null;
  is_loading: boolean;
  is_scanning: boolean;
  is_unsubscribing: boolean;
  error: string | null;
  total: number;
  has_more: boolean;
  fetch_subscriptions: (params?: ListSubscriptionsParams) => Promise<void>;
  load_more: () => Promise<void>;
  scan_for_subscriptions: () => Promise<void>;
  unsubscribe_selected: (ids: string[]) => Promise<UnsubscribeProgress>;
  refresh_stats: () => Promise<void>;
}

interface UnsubscribeProgress {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ id: string; success: boolean; error?: string }>;
}

const DEFAULT_LIMIT = 50;

export function use_subscriptions(
  options: UseSubscriptionsOptions = {},
): UseSubscriptionsReturn {
  const { auto_fetch = false, limit = DEFAULT_LIMIT } = options;

  const [subscriptions, set_subscriptions] = useState<Subscription[]>([]);
  const [stats, set_stats] = useState<SubscriptionStats | null>(null);
  const [is_loading, set_is_loading] = useState(false);
  const [is_scanning, set_is_scanning] = useState(false);
  const [is_unsubscribing, set_is_unsubscribing] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [total, set_total] = useState(0);
  const [has_more, set_has_more] = useState(false);
  const [current_offset, set_current_offset] = useState(0);
  const [current_params, set_current_params] =
    useState<ListSubscriptionsParams>({});

  const fetch_subscriptions = useCallback(
    async (params: ListSubscriptionsParams = {}) => {
      set_is_loading(true);
      set_error(null);
      set_current_params(params);
      set_current_offset(0);

      try {
        const response = await list_subscriptions({
          ...params,
          limit,
          offset: 0,
        });

        if (response.data) {
          set_subscriptions(response.data.subscriptions);
          set_total(response.data.total);
          set_has_more(response.data.has_more);
        } else if (response.error) {
          set_error(
            typeof response.error === "string"
              ? response.error
              : "Failed to load subscriptions",
          );
        }
      } catch (err) {
        set_error(
          err instanceof Error ? err.message : "An unexpected error occurred",
        );
      } finally {
        set_is_loading(false);
      }
    },
    [limit],
  );

  const load_more = useCallback(async () => {
    if (is_loading || !has_more) return;

    set_is_loading(true);
    const new_offset = current_offset + limit;

    try {
      const response = await list_subscriptions({
        ...current_params,
        limit,
        offset: new_offset,
      });

      if (response.data) {
        set_subscriptions((prev) => [...prev, ...response.data!.subscriptions]);
        set_current_offset(new_offset);
        set_has_more(response.data.has_more);
      }
    } catch (err) {
      set_error(
        err instanceof Error
          ? err.message
          : "Failed to load more subscriptions",
      );
    } finally {
      set_is_loading(false);
    }
  }, [is_loading, has_more, current_offset, current_params, limit]);

  const scan_for_subscriptions = useCallback(async () => {
    set_is_scanning(true);
    set_error(null);

    try {
      const response = await scan_subscriptions();

      if (response.data) {
        await fetch_subscriptions(current_params);
        await refresh_stats();
      } else if (response.error) {
        set_error(
          typeof response.error === "string"
            ? response.error
            : "Failed to scan subscriptions",
        );
      }
    } catch (err) {
      set_error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      set_is_scanning(false);
    }
  }, [fetch_subscriptions, current_params]);

  const unsubscribe_selected = useCallback(
    async (ids: string[]): Promise<UnsubscribeProgress> => {
      if (ids.length === 0) {
        return { total: 0, succeeded: 0, failed: 0, results: [] };
      }

      set_is_unsubscribing(true);
      set_error(null);

      try {
        const response = await bulk_unsubscribe(ids);

        if (response.data) {
          set_subscriptions((prev) =>
            prev.map((sub) =>
              ids.includes(sub.id) &&
              response.data!.results.find((r) => r.subscription_id === sub.id)
                ?.success
                ? { ...sub, status: "unsubscribed" as const }
                : sub,
            ),
          );

          await refresh_stats();

          return {
            total: response.data.processed,
            succeeded: response.data.succeeded,
            failed: response.data.failed,
            results: response.data.results.map((r) => ({
              id: r.subscription_id,
              success: r.success,
              error: r.error,
            })),
          };
        } else {
          const error_msg =
            typeof response.error === "string"
              ? response.error
              : "Unsubscribe failed";

          set_error(error_msg);

          return {
            total: ids.length,
            succeeded: 0,
            failed: ids.length,
            results: ids.map((id) => ({
              id,
              success: false,
              error: error_msg,
            })),
          };
        }
      } catch (err) {
        const error_msg =
          err instanceof Error ? err.message : "Unsubscribe failed";

        set_error(error_msg);

        return {
          total: ids.length,
          succeeded: 0,
          failed: ids.length,
          results: ids.map((id) => ({ id, success: false, error: error_msg })),
        };
      } finally {
        set_is_unsubscribing(false);
      }
    },
    [],
  );

  const refresh_stats = useCallback(async () => {
    try {
      const response = await get_subscription_stats();

      if (response.data) {
        set_stats(response.data);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (auto_fetch) {
      fetch_subscriptions();
      refresh_stats();
    }
  }, [auto_fetch, fetch_subscriptions, refresh_stats]);

  return {
    subscriptions,
    stats,
    is_loading,
    is_scanning,
    is_unsubscribing,
    error,
    total,
    has_more,
    fetch_subscriptions,
    load_more,
    scan_for_subscriptions,
    unsubscribe_selected,
    refresh_stats,
  };
}

export function filter_subscriptions_by_category(
  subscriptions: Subscription[],
  category: SubscriptionCategory | "all",
): Subscription[] {
  if (category === "all") return subscriptions;

  return subscriptions.filter((sub) => sub.category === category);
}

export function sort_subscriptions(
  subscriptions: Subscription[],
  field: "email_count" | "last_received" | "sender_name",
  direction: "asc" | "desc",
): Subscription[] {
  return [...subscriptions].sort((a, b) => {
    let comparison = 0;

    switch (field) {
      case "email_count":
        comparison = a.email_count - b.email_count;
        break;
      case "last_received":
        comparison =
          new Date(a.last_received).getTime() -
          new Date(b.last_received).getTime();
        break;
      case "sender_name":
        comparison = a.sender_name.localeCompare(b.sender_name);
        break;
    }

    return direction === "desc" ? -comparison : comparison;
  });
}

export function search_subscriptions(
  subscriptions: Subscription[],
  query: string,
): Subscription[] {
  if (!query.trim()) return subscriptions;

  const lower_query = query.toLowerCase();

  return subscriptions.filter(
    (sub) =>
      sub.sender_name.toLowerCase().includes(lower_query) ||
      sub.sender_email.toLowerCase().includes(lower_query) ||
      sub.domain.toLowerCase().includes(lower_query),
  );
}
