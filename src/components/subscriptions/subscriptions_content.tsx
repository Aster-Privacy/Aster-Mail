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
import type { CachedSubscription } from "@/services/subscription_cache";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useMemo, useCallback, useRef } from "react";
import {
  MagnifyingGlassIcon,
  Bars3Icon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { Button, Checkbox } from "@aster/ui";

import { use_shift_key_ref } from "@/lib/use_shift_range_select";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { EmailTag } from "@/components/ui/email_tag";
import { use_subscriptions } from "@/hooks/use_subscriptions";
import { use_i18n } from "@/lib/i18n/context";
import {
  CATEGORY_TAG_VARIANT,
  get_category_label,
} from "@/components/subscriptions/subscription_constants";

interface SubscriptionsContentProps {
  on_mobile_menu_toggle: () => void;
  on_sender_search?: (query: string, subscription: CachedSubscription) => void;
}

function format_relative_date(
  iso_date: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const date = new Date(iso_date);
  const now = new Date();
  const diff_ms = now.getTime() - date.getTime();
  const diff_days = Math.floor(diff_ms / (1000 * 60 * 60 * 24));

  if (diff_days === 0) return t("common.today");
  if (diff_days === 1) return t("common.yesterday");
  if (diff_days < 7) return t("common.days_ago_short", { count: diff_days });
  if (diff_days < 30)
    return t("common.weeks_ago_short", { count: Math.floor(diff_days / 7) });
  if (diff_days < 365)
    return t("common.months_ago_short", { count: Math.floor(diff_days / 30) });

  return t("common.years_ago_short", { count: Math.floor(diff_days / 365) });
}

export function SubscriptionsContent({
  on_mobile_menu_toggle,
  on_sender_search,
}: SubscriptionsContentProps) {
  const { t } = use_i18n();
  const {
    subscriptions,
    is_loading,
    unsubscribe,
    bulk_unsubscribe,
    reactivate,
  } = use_subscriptions();

  const [active_tab, set_active_tab] = useState<"active" | "unsubscribed">(
    "active",
  );
  const [search_query, set_search_query] = useState("");
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [failed_unsub_ids, set_failed_unsub_ids] = useState<Set<string>>(
    new Set(),
  );

  const active_subscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === "active"),
    [subscriptions],
  );

  const unsubscribed_subscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === "unsubscribed"),
    [subscriptions],
  );

  const current_list = useMemo(() => {
    const base =
      active_tab === "active"
        ? active_subscriptions
        : unsubscribed_subscriptions;

    if (!search_query) return base;

    const query = search_query.toLowerCase();

    return base.filter(
      (s) =>
        s.sender_name.toLowerCase().includes(query) ||
        s.sender_email.toLowerCase().includes(query) ||
        s.domain.toLowerCase().includes(query),
    );
  }, [
    active_tab,
    active_subscriptions,
    unsubscribed_subscriptions,
    search_query,
  ]);

  const handle_sender_click = useCallback(
    (sub: CachedSubscription) => {
      const query = `from:${sub.sender_email}`;

      if (on_sender_search) {
        on_sender_search(query, sub);
      }
    },
    [on_sender_search],
  );

  const shift_ref = use_shift_key_ref();
  const last_selected_email_ref = useRef<string | null>(null);
  const current_list_ref = useRef(current_list);

  current_list_ref.current = current_list;

  const handle_toggle_select = useCallback(
    (sender_email: string) => {
      const shift = shift_ref.current;
      const last_email = last_selected_email_ref.current;
      const items = current_list_ref.current;

      set_selected_ids((prev) => {
        const next = new Set(prev);

        if (shift && last_email !== null && last_email !== sender_email) {
          const last_index = items.findIndex(
            (s) => s.sender_email === last_email,
          );
          const current_index = items.findIndex(
            (s) => s.sender_email === sender_email,
          );

          if (last_index !== -1 && current_index !== -1) {
            const start = Math.min(last_index, current_index);
            const end = Math.max(last_index, current_index);
            const should_select = prev.has(last_email);

            for (let i = start; i <= end; i++) {
              const item_email = items[i].sender_email;

              if (should_select) {
                next.add(item_email);
              } else {
                next.delete(item_email);
              }
            }

            last_selected_email_ref.current = sender_email;

            return next;
          }
        }

        if (next.has(sender_email)) {
          next.delete(sender_email);
        } else {
          next.add(sender_email);
        }

        last_selected_email_ref.current = sender_email;

        return next;
      });
    },
    [shift_ref],
  );

  const handle_toggle_select_all = useCallback(() => {
    if (selected_ids.size === current_list.length) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(current_list.map((s) => s.sender_email)));
    }
  }, [selected_ids.size, current_list]);

  const handle_bulk_unsubscribe = useCallback(async () => {
    const emails = Array.from(selected_ids);

    set_selected_ids(new Set());
    await bulk_unsubscribe(emails);
  }, [selected_ids, bulk_unsubscribe]);

  const handle_unsubscribe = useCallback(
    async (e: React.MouseEvent, sender_email: string) => {
      e.stopPropagation();
      const result = await unsubscribe(sender_email);

      if (result === "failed") {
        set_failed_unsub_ids((prev) => new Set([...prev, sender_email]));
      }
    },
    [unsubscribe],
  );

  const handle_open_unsubscribe_page = useCallback(
    (e: React.MouseEvent, sub: CachedSubscription) => {
      e.stopPropagation();
      const link = sub.unsubscribe_link || sub.list_unsubscribe_header;

      if (link) {
        window.open(link, "_blank", "noopener,noreferrer");
      }
    },
    [],
  );

  const handle_reactivate = useCallback(
    async (e: React.MouseEvent, sender_email: string) => {
      e.stopPropagation();
      await reactivate(sender_email);
    },
    [reactivate],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-14 flex-shrink-0 border-b border-edge-primary">
        <button
          className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-txt-primary"
          onClick={on_mobile_menu_toggle}
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary flex-1">
          {t("common.subscriptions")}
        </h1>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0">
        <div className="flex rounded-lg overflow-hidden border border-edge-primary">
          <button
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              active_tab === "active"
                ? "bg-blue-500 text-white"
                : "text-txt-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            }`}
            onClick={() => {
              set_active_tab("active");
              set_selected_ids(new Set());
            }}
          >
            {t("settings.active_count", {
              count: String(active_subscriptions.length),
            })}
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              active_tab === "unsubscribed"
                ? "bg-blue-500 text-white"
                : "text-txt-secondary hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            }`}
            onClick={() => {
              set_active_tab("unsubscribed");
              set_selected_ids(new Set());
            }}
          >
            {t("common.unsubscribed_count", {
              count: String(unsubscribed_subscriptions.length),
            })}
          </button>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted" />
          <Input
            className="w-48 pl-8 pr-3 bg-transparent"
            placeholder={t("common.search")}
            size="md"
            type="text"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
        </div>
      </div>

      {is_loading ? (
        <div className="flex-1 flex items-center justify-center">
          <ArrowPathIcon className="w-6 h-6 animate-spin text-txt-muted" />
        </div>
      ) : current_list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-txt-muted">
          <p className="text-sm">
            {search_query
              ? t("common.no_results")
              : active_tab === "active"
                ? t("settings.no_subscriptions_detected")
                : t("common.no_unsubscribed_senders")}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {active_tab === "active" && current_list.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-edge-primary">
              <Checkbox
                checked={
                  selected_ids.size > 0 &&
                  selected_ids.size === current_list.length
                }
                className="flex-shrink-0"
                indeterminate={
                  selected_ids.size > 0 &&
                  selected_ids.size < current_list.length
                }
                onCheckedChange={handle_toggle_select_all}
              />
              <span className="text-xs text-txt-muted">
                {t("common.select_all")}
              </span>
            </div>
          )}
          {current_list.map((sub) => (
            <SubscriptionRow
              key={sub.sender_email}
              active_tab={active_tab}
              is_selected={selected_ids.has(sub.sender_email)}
              on_click={handle_sender_click}
              on_open_unsubscribe_page={handle_open_unsubscribe_page}
              on_reactivate={handle_reactivate}
              on_toggle_select={handle_toggle_select}
              on_unsubscribe={handle_unsubscribe}
              subscription={sub}
              unsub_failed={failed_unsub_ids.has(sub.sender_email)}
            />
          ))}
        </div>
      )}

      {selected_ids.size > 0 && active_tab === "active" && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-edge-primary bg-bg-secondary dark:bg-bg-secondary">
          <span className="text-sm text-txt-secondary">
            {selected_ids.size} {t("common.selected")}
          </span>
          <button
            className="px-4 py-1.5 rounded-lg text-white text-sm font-medium transition-all duration-150 bg-gradient-to-b from-[#ef4444] via-[#dc2626] to-[#b91c1c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:from-[#f05555] hover:via-[#e23737] hover:to-[#c92d2d]"
            onClick={handle_bulk_unsubscribe}
          >
            {t("mail.unsubscribe")} ({selected_ids.size})
          </button>
        </div>
      )}
    </div>
  );
}

interface SubscriptionRowProps {
  subscription: CachedSubscription;
  is_selected: boolean;
  active_tab: "active" | "unsubscribed";
  unsub_failed?: boolean;
  on_click: (sub: CachedSubscription) => void;
  on_toggle_select: (sender_email: string) => void;
  on_unsubscribe: (e: React.MouseEvent, sender_email: string) => void;
  on_open_unsubscribe_page: (
    e: React.MouseEvent,
    sub: CachedSubscription,
  ) => void;
  on_reactivate: (e: React.MouseEvent, sender_email: string) => void;
}

function SubscriptionRow({
  subscription: sub,
  is_selected,
  active_tab,
  unsub_failed,
  on_click,
  on_toggle_select,
  on_unsubscribe,
  on_open_unsubscribe_page,
  on_reactivate,
}: SubscriptionRowProps) {
  const { t } = use_i18n();
  const tag_variant = (CATEGORY_TAG_VARIANT[sub.category] || "neutral") as
    | "blue"
    | "purple"
    | "green"
    | "amber"
    | "neutral";

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b border-edge-primary hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
      onClick={() => on_click(sub)}
    >
      {active_tab === "active" && (
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={is_selected}
            onCheckedChange={() => on_toggle_select(sub.sender_email)}
          />
        </div>
      )}

      <ProfileAvatar
        use_domain_logo
        email={sub.sender_email}
        name={sub.sender_name || sub.sender_email}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-txt-primary truncate">
            {sub.sender_name || sub.sender_email}
          </span>
          <EmailTag
            label={get_category_label(sub.category, t)}
            show_icon={false}
            size="xs"
            variant={tag_variant}
          />
          {sub.has_one_click && (
            <ShieldCheckIcon
              className="w-3.5 h-3.5 text-green-500 flex-shrink-0"
              title={t("common.one_click_unsubscribe")}
            />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-txt-muted">
          <span className="truncate">{sub.sender_email}</span>
          <span>·</span>
          <span className="flex-shrink-0">
            {t("settings.emails_count", { count: String(sub.email_count) })}
          </span>
          <span>·</span>
          <span className="flex-shrink-0">
            {format_relative_date(sub.last_received, t)}
          </span>
        </div>
      </div>

      {active_tab === "active" ? (
        unsub_failed &&
        (sub.unsubscribe_link || sub.list_unsubscribe_header) ? (
          <button
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 flex-shrink-0 hover:brightness-110"
            style={{
              background:
                "linear-gradient(to bottom, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
              color: "#ffffff",
            }}
            onClick={(e) => on_open_unsubscribe_page(e, sub)}
          >
            {t("settings.open_unsubscribe_page")}
          </button>
        ) : (
          <button
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 flex-shrink-0 text-white bg-gradient-to-b from-[#ef4444] via-[#dc2626] to-[#b91c1c] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] hover:from-[#f05555] hover:via-[#e23737] hover:to-[#c92d2d]"
            onClick={(e) => on_unsubscribe(e, sub.sender_email)}
          >
            {t("mail.unsubscribe")}
          </button>
        )
      ) : (
        <Button
          className="flex-shrink-0"
          size="sm"
          variant="depth"
          onClick={(e) => on_reactivate(e, sub.sender_email)}
        >
          {t("settings.reactivate")}
        </Button>
      )}
    </div>
  );
}
