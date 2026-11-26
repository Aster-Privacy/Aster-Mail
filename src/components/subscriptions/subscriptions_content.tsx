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

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  MagnifyingGlassIcon,
  Bars3Icon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { Badge, Checkbox, IslandEmpty, PillButton } from "@aster/ui";

import { use_shift_key_ref } from "@/lib/use_shift_range_select";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { use_subscriptions } from "@/hooks/use_subscriptions";
import { use_subscription_scan_in_flight } from "@/hooks/use_background_subscription_scan";
import { use_i18n } from "@/lib/i18n/context";
import { safe_sender_name } from "@/lib/sender_trust_store";
import { use_page_search } from "@/hooks/use_page_search";
import { use_external_link } from "@/contexts/external_link_context";
import { calendar_day_diff } from "@/utils/date_format";
import { get_manual_unsubscribe_url } from "@/utils/unsubscribe_detector";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  BulkUnsubscribeDialog,
  is_automatic_unsubscribe,
  manual_page_url,
} from "@/components/subscriptions/bulk_unsubscribe_dialog";
import {
  reduce_subscription_selection,
  subscription_bar_actions,
  type SubscriptionBarAction,
} from "@/components/subscriptions/subscription_selection";
import {
  get_category_badge_color,
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
  const diff_days = calendar_day_diff(date, now);

  if (diff_days <= 0) return t("common.today");
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
  const { handle_external_link } = use_external_link();
  const {
    subscriptions,
    is_loading,
    unsubscribe,
    bulk_unsubscribe,
    mark_unsubscribed,
    reactivate,
    delete_senders,
  } = use_subscriptions();
  const scan_in_flight = use_subscription_scan_in_flight();

  const [active_tab, set_active_tab] = useState<"active" | "unsubscribed">(
    "active",
  );
  const search_query = use_page_search();
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [failed_unsub_ids, set_failed_unsub_ids] = useState<Set<string>>(
    new Set(),
  );
  const [pending_delete, set_pending_delete] = useState<string[]>([]);
  const [is_deleting, set_is_deleting] = useState(false);
  const [unsubscribe_flow, set_unsubscribe_flow] = useState<{
    senders: CachedSubscription[];
    start_phase: "confirm" | "pages";
  } | null>(null);

  const active_subscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === "active"),
    [subscriptions],
  );

  const unsubscribed_subscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === "unsubscribed"),
    [subscriptions],
  );

  useEffect(() => {
    set_selected_ids((prev) => {
      if (prev.size === 0) return prev;

      const tab_list =
        active_tab === "active"
          ? active_subscriptions
          : unsubscribed_subscriptions;
      const still_listed = new Set(tab_list.map((s) => s.sender_email));
      const next = new Set(
        Array.from(prev).filter((email) => still_listed.has(email)),
      );

      return next.size === prev.size ? prev : next;
    });
  }, [active_tab, active_subscriptions, unsubscribed_subscriptions]);

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

  const visible_selected_count = useMemo(
    () => current_list.filter((s) => selected_ids.has(s.sender_email)).length,
    [current_list, selected_ids],
  );

  const handle_toggle_select_all = useCallback(() => {
    if (
      current_list.length > 0 &&
      visible_selected_count === current_list.length
    ) {
      set_selected_ids(new Set());
    } else {
      set_selected_ids(new Set(current_list.map((s) => s.sender_email)));
    }
  }, [visible_selected_count, current_list]);

  const handle_bulk_unsubscribe = useCallback(
    (emails: string[]) => {
      const wanted = new Set(emails);
      const senders = active_subscriptions.filter((s) =>
        wanted.has(s.sender_email),
      );

      if (senders.length === 0) return;
      set_unsubscribe_flow({ senders, start_phase: "confirm" });
    },
    [active_subscriptions],
  );

  const handle_unsubscribe_flow_close = useCallback(
    (remaining: string[]) => {
      const flow = unsubscribe_flow;

      set_unsubscribe_flow(null);
      if (!flow) return;

      const by_email = new Map(flow.senders.map((s) => [s.sender_email, s]));
      const with_page = remaining.filter((email) => {
        const sub = by_email.get(email);

        return sub ? Boolean(manual_page_url(sub)) : false;
      });

      if (with_page.length > 0) {
        set_failed_unsub_ids((prev) => new Set([...prev, ...with_page]));
      }
      if (flow.start_phase === "confirm") {
        set_selected_ids(new Set(remaining));
      }
    },
    [unsubscribe_flow],
  );

  const handle_bar_action = useCallback(
    (action: SubscriptionBarAction) => {
      const result = reduce_subscription_selection(
        selected_ids,
        current_list.map((s) => s.sender_email),
        action,
      );

      set_selected_ids(result.selected);

      if (result.unsubscribe_request.length > 0) {
        handle_bulk_unsubscribe(result.unsubscribe_request);
      }

      if (result.reactivate_request.length > 0) {
        void (async () => {
          for (const email of result.reactivate_request) {
            await reactivate(email);
          }
        })();
      }

      if (result.delete_request.length > 0) {
        set_pending_delete(result.delete_request);
      }
    },
    [selected_ids, current_list, handle_bulk_unsubscribe, reactivate],
  );

  const handle_request_delete = useCallback(
    (e: React.MouseEvent, sender_email: string) => {
      e.stopPropagation();
      set_pending_delete([sender_email]);
    },
    [],
  );

  const handle_confirm_delete = useCallback(async () => {
    const emails = pending_delete;

    if (emails.length === 0) return;

    set_is_deleting(true);

    const deleted = await delete_senders(emails);

    set_is_deleting(false);
    set_pending_delete([]);

    if (deleted) {
      const removed = new Set(emails);

      set_selected_ids(
        (prev) =>
          new Set(Array.from(prev).filter((email) => !removed.has(email))),
      );
    }
  }, [pending_delete, delete_senders]);

  const bar_selected_count = visible_selected_count;

  const handle_unsubscribe = useCallback(
    async (e: React.MouseEvent, sender_email: string) => {
      e.stopPropagation();
      const sub = active_subscriptions.find(
        (s) => s.sender_email === sender_email,
      );

      if (sub && !is_automatic_unsubscribe(sub) && manual_page_url(sub)) {
        set_unsubscribe_flow({ senders: [sub], start_phase: "pages" });

        return;
      }
      const result = await unsubscribe(sender_email);

      if (result === "failed" || result === "manual") {
        set_failed_unsub_ids((prev) => new Set([...prev, sender_email]));
      }
    },
    [unsubscribe, active_subscriptions],
  );

  const handle_open_unsubscribe_page = useCallback(
    (e: React.MouseEvent, sub: CachedSubscription) => {
      e.stopPropagation();
      const link = get_manual_unsubscribe_url(sub);

      if (link) {
        handle_external_link(link);
      }
    },
    [handle_external_link],
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
      <div className="flex items-center gap-2 px-4 h-14 flex-shrink-0">
        <button
          className="md:hidden flex items-center justify-center w-9 h-9 rounded-full transition-colors hover:bg-[var(--aster-hover)] text-txt-primary"
          onClick={on_mobile_menu_toggle}
        >
          <Bars3Icon className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-txt-primary flex-1">
          {t("common.subscriptions")}
        </h1>
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 flex-shrink-0">
        <SettingsTabBar
          active={active_tab}
          class_name="mb-0"
          layout_id="subscriptions_tabs"
          on_change={(key) => {
            set_active_tab(key);
            set_selected_ids(new Set());
          }}
          tabs={[
            {
              key: "active",
              label: t("settings.active_count", {
                count: active_subscriptions.length,
              }),
            },
            {
              key: "unsubscribed",
              label: t("common.unsubscribed_count", {
                count: unsubscribed_subscriptions.length,
              }),
            },
          ]}
        />
        <div className="flex-1" />
      </div>

      {is_loading || (scan_in_flight && subscriptions.length === 0) ? (
        <SubscriptionsListSkeleton />
      ) : current_list.length === 0 ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">
          <IslandEmpty
            icon={<MagnifyingGlassIcon />}
            title={
              search_query
                ? t("common.no_results")
                : active_tab === "active"
                  ? t("settings.no_subscriptions_detected")
                  : t("common.no_unsubscribed_senders")
            }
          />
        </div>
      ) : (
        <div className="aster_scrollbar_thin flex-1 overflow-y-auto px-4 pb-4 pt-1">
          {current_list.length > 0 && (
            <div className="mb-1 flex min-h-10 w-full items-stretch rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
              <Checkbox
                checked={
                  visible_selected_count > 0 &&
                  visible_selected_count === current_list.length
                }
                className="flex-shrink-0 ps-4 pe-3"
                id="subscriptions-select-all"
                indeterminate={
                  visible_selected_count > 0 &&
                  visible_selected_count < current_list.length
                }
                onCheckedChange={handle_toggle_select_all}
              />
              <label
                className="flex flex-1 cursor-pointer select-none items-center pe-4 text-xs text-txt-muted"
                htmlFor="subscriptions-select-all"
              >
                {t("common.select_all")}
              </label>
            </div>
          )}
          <div className="aster_island aster_island_divided">
            {current_list.map((sub) => (
              <SubscriptionRow
                key={sub.sender_email}
                active_tab={active_tab}
                is_clickable={!!on_sender_search}
                is_selected={selected_ids.has(sub.sender_email)}
                on_click={handle_sender_click}
                on_open_unsubscribe_page={handle_open_unsubscribe_page}
                on_reactivate={handle_reactivate}
                on_request_delete={handle_request_delete}
                on_toggle_select={handle_toggle_select}
                on_unsubscribe={handle_unsubscribe}
                subscription={sub}
                unsub_failed={failed_unsub_ids.has(sub.sender_email)}
              />
            ))}
          </div>
        </div>
      )}

      {bar_selected_count > 0 && (
        <div className="flex-shrink-0 px-4 pb-4 pt-2">
          <div className="aster_island aster_island_pad_sm flex flex-wrap items-center justify-between gap-3 ps-4">
            <span className="text-sm text-txt-secondary">
              {bar_selected_count} {t("common.selected")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {subscription_bar_actions(active_tab).map((action) => (
                <PillButton
                  key={action}
                  size="sm"
                  variant={
                    action === "deselect"
                      ? "outline"
                      : action === "reactivate"
                        ? "tonal"
                        : "danger"
                  }
                  onClick={() => handle_bar_action(action)}
                >
                  {action === "deselect"
                    ? t("common.deselect_all")
                    : action === "reactivate"
                      ? `${t("settings.reactivate")} (${bar_selected_count})`
                      : action === "unsubscribe"
                        ? `${t("mail.unsubscribe")} (${bar_selected_count})`
                        : t("settings.delete_selected_subscriptions", {
                            count: bar_selected_count,
                          })}
                </PillButton>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.delete")}
        is_loading={is_deleting}
        is_open={pending_delete.length > 0}
        message={t("settings.delete_subscriptions_body")}
        title={t("settings.delete_subscriptions_title", {
          count: pending_delete.length,
        })}
        variant="danger"
        on_cancel={() => {
          if (!is_deleting) set_pending_delete([]);
        }}
        on_confirm={handle_confirm_delete}
      />

      {unsubscribe_flow && (
        <BulkUnsubscribeDialog
          mark_unsubscribed={mark_unsubscribed}
          on_close={handle_unsubscribe_flow_close}
          run_bulk={bulk_unsubscribe}
          senders={unsubscribe_flow.senders}
          start_phase={unsubscribe_flow.start_phase}
        />
      )}
    </div>
  );
}

function SubscriptionsListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-4 pb-4 pt-1">
      <div className="aster_island aster_island_divided">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="aster_island_row">
            <Skeleton className="h-4 w-4 rounded-[4px] flex-shrink-0" />
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-full max-w-[180px]" />
              <Skeleton className="h-3 w-full max-w-[240px]" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full flex-shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SubscriptionRowProps {
  subscription: CachedSubscription;
  is_selected: boolean;
  active_tab: "active" | "unsubscribed";
  unsub_failed?: boolean;
  is_clickable: boolean;
  on_click: (sub: CachedSubscription) => void;
  on_toggle_select: (sender_email: string) => void;
  on_unsubscribe: (e: React.MouseEvent, sender_email: string) => void;
  on_open_unsubscribe_page: (
    e: React.MouseEvent,
    sub: CachedSubscription,
  ) => void;
  on_reactivate: (e: React.MouseEvent, sender_email: string) => void;
  on_request_delete: (e: React.MouseEvent, sender_email: string) => void;
}

function SubscriptionRow({
  subscription: sub,
  is_selected,
  active_tab,
  unsub_failed,
  is_clickable,
  on_click,
  on_toggle_select,
  on_unsubscribe,
  on_open_unsubscribe_page,
  on_reactivate,
  on_request_delete,
}: SubscriptionRowProps) {
  const { t } = use_i18n();
  const shown_name =
    safe_sender_name(sub.sender_name, sub.sender_email) || sub.sender_email;

  return (
    <div
      className={
        is_clickable
          ? "aster_island_row aster_island_row_pressable"
          : "aster_island_row"
      }
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 61px",
      }}
      onClick={is_clickable ? () => on_click(sub) : undefined}
    >
      <div
        className="-my-2 -ms-2 flex flex-shrink-0 items-stretch self-stretch"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          aria-label={shown_name}
          checked={is_selected}
          className="p-2"
          onCheckedChange={() => on_toggle_select(sub.sender_email)}
        />
      </div>

      <ProfileAvatar
        use_domain_logo
        email={sub.sender_email}
        name={shown_name}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-txt-primary truncate">
            {shown_name}
          </span>
          <Badge
            className="flex-shrink-0 whitespace-nowrap"
            color={get_category_badge_color(sub.category)}
          >
            {get_category_label(sub.category, t)}
          </Badge>
          {sub.has_one_click && (
            <ShieldCheckIcon
              className="w-3.5 h-3.5 text-[var(--color-success)] flex-shrink-0"
              title={t("common.one_click_unsubscribe")}
            />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-txt-muted">
          <span className="truncate">{sub.sender_email}</span>
          <span>·</span>
          <span className="flex-shrink-0">
            {sub.email_count === 1
              ? t("common.one_email")
              : t("settings.emails_count", {
                  count: sub.email_count,
                })}
          </span>
          <span>·</span>
          <span className="flex-shrink-0">
            {format_relative_date(sub.last_received, t)}
          </span>
        </div>
      </div>

      {active_tab === "active" ? (
        unsub_failed && get_manual_unsubscribe_url(sub) ? (
          <PillButton
            className="flex-shrink-0"
            size="sm"
            variant="tonal"
            onClick={(e) => on_open_unsubscribe_page(e, sub)}
          >
            {t("settings.open_unsubscribe_page")}
          </PillButton>
        ) : (
          <PillButton
            className="flex-shrink-0"
            size="sm"
            variant="danger"
            onClick={(e) => on_unsubscribe(e, sub.sender_email)}
          >
            {t("mail.unsubscribe")}
          </PillButton>
        )
      ) : (
        <PillButton
          className="flex-shrink-0"
          size="sm"
          variant="tonal"
          onClick={(e) => on_reactivate(e, sub.sender_email)}
        >
          {t("settings.reactivate")}
        </PillButton>
      )}
      <button
        aria-label={t("common.delete")}
        className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-colors hover:bg-[var(--aster-hover)] text-txt-muted"
        title={t("common.delete")}
        type="button"
        onClick={(e) => on_request_delete(e, sub.sender_email)}
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
