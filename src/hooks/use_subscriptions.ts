//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type {
  CachedSubscription,
  SubscriptionCacheData,
} from "@/services/subscription_cache";

import { useState, useEffect, useCallback, useRef } from "react";

import {
  load_subscription_cache,
  save_subscription_cache,
  SUBSCRIPTION_CACHE_VERSION,
} from "@/services/subscription_cache";
import { perform_unsubscribe, UnsubscribeError } from "@/utils/unsubscribe_detector";
import { UNSUBSCRIBE_EVENT } from "@/hooks/use_unsubscribed_senders";
import { use_auth } from "@/contexts/auth_context";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

export function use_subscriptions() {
  const { vault } = use_auth();
  const { t } = use_i18n();
  const [subscriptions, set_subscriptions] = useState<CachedSubscription[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const cache_ref = useRef<SubscriptionCacheData | null>(null);
  const mounted_ref = useRef(false);
  const poll_ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutating_ref = useRef(0);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
      if (poll_ref.current) clearInterval(poll_ref.current);
    };
  }, []);

  const load_cache = useCallback(async () => {
    if (!vault) return;
    if (mutating_ref.current > 0) return;

    const cached = await load_subscription_cache(vault);

    if (!mounted_ref.current) return;
    if (mutating_ref.current > 0) return;

    if (cached) {
      cache_ref.current = cached;
      set_subscriptions(cached.subscriptions);
    }

    set_is_loading(false);
  }, [vault]);

  useEffect(() => {
    load_cache();

    poll_ref.current = setInterval(() => {
      load_cache();
    }, 10000);

    return () => {
      if (poll_ref.current) clearInterval(poll_ref.current);
    };
  }, [load_cache]);

  useEffect(() => {
    const handle_external_unsub = (e: Event) => {
      const sender_email = (e as CustomEvent).detail?.sender_email;
      if (!sender_email || !vault || mutating_ref.current > 0) return;

      const current_subs = cache_ref.current?.subscriptions || subscriptions;
      const already_tracked = current_subs.some(
        (s) => s.sender_email === sender_email,
      );
      if (!already_tracked) return;

      const updated = current_subs.map((s) =>
        s.sender_email === sender_email
          ? {
              ...s,
              status: "unsubscribed" as const,
              unsubscribed_at: new Date().toISOString(),
            }
          : s,
      );

      cache_ref.current = {
        subscriptions: updated,
        last_scan_ts:
          cache_ref.current?.last_scan_ts || new Date().toISOString(),
        version: SUBSCRIPTION_CACHE_VERSION,
      };
      set_subscriptions(updated);
      save_subscription_cache(cache_ref.current, vault);
    };

    window.addEventListener(UNSUBSCRIBE_EVENT, handle_external_unsub);
    return () => {
      window.removeEventListener(UNSUBSCRIBE_EVENT, handle_external_unsub);
    };
  }, [subscriptions, vault]);

  const unsubscribe_sender = useCallback(
    async (sender_email: string): Promise<"success" | "manual" | "failed"> => {
      mutating_ref.current++;
      const current_subs = cache_ref.current?.subscriptions || subscriptions;
      const sub = current_subs.find((s) => s.sender_email === sender_email);

      if (!sub) {
        mutating_ref.current--;

        return "failed";
      }

      const optimistic = current_subs.map((s) =>
        s.sender_email === sender_email
          ? {
              ...s,
              status: "unsubscribed" as const,
              unsubscribed_at: new Date().toISOString(),
            }
          : s,
      );

      cache_ref.current = {
        subscriptions: optimistic,
        last_scan_ts:
          cache_ref.current?.last_scan_ts || new Date().toISOString(),
        version: SUBSCRIPTION_CACHE_VERSION,
      };
      set_subscriptions(optimistic);

      try {
        const result = await perform_unsubscribe(
          sub.sender_email,
          sub.sender_name,
          {
            has_unsubscribe: true,
            method: sub.has_one_click
              ? "one-click"
              : sub.unsubscribe_link
                ? "link"
                : "none",
            unsubscribe_link: sub.unsubscribe_link,
            list_unsubscribe_header: sub.list_unsubscribe_header,
            list_unsubscribe_post: sub.list_unsubscribe_post,
          },
        );

        if (result === "api") {
          show_toast(t("mail.successfully_unsubscribed"), "success");
        } else if (result === "link" || result === "mailto") {
          show_toast(t("mail.unsubscribe_manual_required"), "info");
        }

        await save_subscription_cache(cache_ref.current, vault!);
        mutating_ref.current--;
        window.dispatchEvent(
          new CustomEvent(UNSUBSCRIBE_EVENT, { detail: { sender_email } }),
        );

        return result === "link" || result === "mailto" ? "manual" : "success";
      } catch (err) {
        if (err instanceof UnsubscribeError && err.code !== "cancelled") {
          show_toast(t(err.i18n_key), "error");
        } else if (!(err instanceof UnsubscribeError)) {
          show_toast(t("mail.unsubscribe_failed"), "error");
        }

        const reverted = (cache_ref.current?.subscriptions || []).map((s) =>
          s.sender_email === sender_email
            ? { ...s, status: "active" as const, unsubscribed_at: undefined }
            : s,
        );

        cache_ref.current = {
          subscriptions: reverted,
          last_scan_ts:
            cache_ref.current?.last_scan_ts || new Date().toISOString(),
          version: SUBSCRIPTION_CACHE_VERSION,
        };
        set_subscriptions(reverted);
        mutating_ref.current--;

        return "failed";
      }
    },
    [subscriptions, vault, t],
  );

  const bulk_unsubscribe = useCallback(
    async (sender_emails: string[]) => {
      mutating_ref.current++;
      const current_subs = cache_ref.current?.subscriptions || subscriptions;
      const batch_size = 5;
      const emails_set = new Set(sender_emails);

      const optimistic = current_subs.map((s) =>
        emails_set.has(s.sender_email)
          ? {
              ...s,
              status: "unsubscribed" as const,
              unsubscribed_at: new Date().toISOString(),
            }
          : s,
      );

      cache_ref.current = {
        subscriptions: optimistic,
        last_scan_ts:
          cache_ref.current?.last_scan_ts || new Date().toISOString(),
        version: SUBSCRIPTION_CACHE_VERSION,
      };
      set_subscriptions(optimistic);

      for (let i = 0; i < sender_emails.length; i += batch_size) {
        const batch = sender_emails.slice(i, i + batch_size);

        await Promise.allSettled(
          batch.map(async (email) => {
            const sub = current_subs.find((s) => s.sender_email === email);

            if (!sub) return;

            try {
              await perform_unsubscribe(sub.sender_email, sub.sender_name, {
                has_unsubscribe: true,
                method: sub.has_one_click
                  ? "one-click"
                  : sub.unsubscribe_link
                    ? "link"
                    : "none",
                unsubscribe_link: sub.unsubscribe_link,
                list_unsubscribe_header: sub.list_unsubscribe_header,
                list_unsubscribe_post: sub.list_unsubscribe_post,
              });
            } catch {}
          }),
        );
      }

      await save_subscription_cache(cache_ref.current, vault!);
      mutating_ref.current--;
    },
    [subscriptions, vault],
  );

  const reactivate = useCallback(
    async (sender_email: string) => {
      mutating_ref.current++;
      const current_subs = cache_ref.current?.subscriptions || subscriptions;
      const updated = current_subs.map((s) =>
        s.sender_email === sender_email
          ? { ...s, status: "active" as const, unsubscribed_at: undefined }
          : s,
      );

      cache_ref.current = {
        subscriptions: updated,
        last_scan_ts:
          cache_ref.current?.last_scan_ts || new Date().toISOString(),
        version: SUBSCRIPTION_CACHE_VERSION,
      };
      set_subscriptions(updated);
      await save_subscription_cache(cache_ref.current, vault!);
      mutating_ref.current--;
    },
    [subscriptions, vault],
  );

  return {
    subscriptions,
    is_loading,
    unsubscribe: unsubscribe_sender,
    bulk_unsubscribe,
    reactivate,
  };
}
