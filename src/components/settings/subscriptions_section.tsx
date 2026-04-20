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
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useEffect, useCallback } from "react";
import {
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { SnoozeIcon } from "@/components/common/icons";
import { show_action_toast } from "@/components/toast/action_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_shift_range_select } from "@/lib/use_shift_range_select";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import {
  list_subscriptions,
  get_subscription_stats,
  bulk_unsubscribe,
  reactivate_subscription,
  type Subscription,
  type SubscriptionStats,
} from "@/services/api/subscriptions";
import {
  scan_inbox_for_subscriptions,
  type ScanProgress,
} from "@/services/subscription_scanner";

const SNOOZE_COLOR = "#3b82f6";

const DOMAIN_AVATAR_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#22c55e",
  "#14b8a6",
  "#6b7280",
];

function hash_domain(domain: string): number {
  let hash = 0;

  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash);
}

function get_domain_color(domain: string): string {
  return DOMAIN_AVATAR_COLORS[
    hash_domain(domain) % DOMAIN_AVATAR_COLORS.length
  ];
}

function get_domain_initial(domain: string): string {
  if (!domain) return "?";
  const parts = domain.split(".");

  if (parts.length >= 2) {
    return parts[0].charAt(0).toUpperCase();
  }

  return domain.charAt(0).toUpperCase();
}

const CATEGORY_COLORS: Record<string, string> = {
  newsletter: "#3b82f6",
  marketing: "#f59e0b",
  social: "#8b5cf6",
  transactional: "#22c55e",
  unknown: "#6b7280",
};

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  newsletter: "settings.newsletter",
  marketing: "common.marketing",
  social: "settings.social",
  transactional: "settings.transactional",
  unknown: "settings.other",
};

export function SubscriptionsSection() {
  const { t } = use_i18n();
  const [subscriptions, set_subscriptions] = useState<Subscription[]>([]);
  const [stats, set_stats] = useState<SubscriptionStats | null>(null);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [is_scanning, set_is_scanning] = useState(false);
  const [scan_progress, set_scan_progress] = useState<ScanProgress | null>(
    null,
  );
  const [is_unsubscribing, set_is_unsubscribing] = useState(false);
  const [show_snoozed, set_show_snoozed] = useState(false);

  const fetch_subscriptions = useCallback(
    async (show_loading = false) => {
      try {
        const status = show_snoozed ? "unsubscribed" : "active";
        const [subs_result, stats_result] = await Promise.all([
          list_subscriptions({ status, limit: 100 }),
          get_subscription_stats(),
        ]);

        if (subs_result.data) {
          set_subscriptions(subs_result.data.subscriptions);
        }
        if (stats_result.data) {
          set_stats(stats_result.data);
        }
      } finally {
        if (show_loading) {
          set_is_initial_load(false);
        }
      }
    },
    [show_snoozed],
  );

  const is_locked = false;

  useEffect(() => {
    fetch_subscriptions(is_initial_load);
  }, [fetch_subscriptions, is_initial_load]);

  const displayed_stats = {
    total: stats?.active ?? 0,
    snoozed: stats?.unsubscribed ?? 0,
  };

  const handle_select = use_shift_range_select(
    subscriptions,
    (sub) => sub.id,
    selected_ids,
    set_selected_ids,
  );

  const handle_scan = async () => {
    set_is_scanning(true);
    set_scan_progress(null);

    try {
      const { new_count, updated_count } = await scan_inbox_for_subscriptions(
        (progress) => set_scan_progress(progress),
      );

      if (new_count > 0 || updated_count > 0) {
        await fetch_subscriptions();
      }
    } finally {
      set_is_scanning(false);
      set_scan_progress(null);
    }
  };

  const handle_unsubscribe = async () => {
    if (selected_ids.size === 0) return;

    set_is_unsubscribing(true);
    try {
      const result = await bulk_unsubscribe(Array.from(selected_ids));

      if (result.data?.success || (result.data?.succeeded ?? 0) > 0) {
        set_subscriptions((prev) =>
          prev.filter((sub) => !selected_ids.has(sub.id)),
        );
        set_selected_ids(new Set());
        await fetch_subscriptions();
        show_action_toast({
          message: t("mail.successfully_unsubscribed"),
          action_type: "not_spam",
          email_ids: [],
        });
      } else {
        show_action_toast({
          message: t("mail.unsubscribe_failed"),
          action_type: "not_spam",
          email_ids: [],
        });
      }
    } finally {
      set_is_unsubscribing(false);
    }
  };

  const handle_reactivate = async (subscription_id: string) => {
    const result = await reactivate_subscription(subscription_id);

    if (result.data?.success) {
      set_subscriptions((prev) =>
        prev.filter((sub) => sub.id !== subscription_id),
      );
      await fetch_subscriptions();
    }
  };

  const format_date = (date_string: string) => {
    const date = new Date(date_string);

    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (is_locked) {
    return (
      <UpgradeGate
        description={t("settings.subscription_manager_locked")}
        feature_name={t("settings.plan_f_subscription_manager")}
        is_locked={true}
        min_plan="Star"
        variant="centered"
      >
        <></>
      </UpgradeGate>
    );
  }

  if (is_initial_load) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <UpgradeGate
      description={t("settings.subscription_manager_locked")}
      feature_name={t("settings.plan_f_subscription_manager")}
      is_locked={false}
      min_plan="Star"
      variant="centered"
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-txt-primary">
            {t("settings.plan_f_subscription_manager")}
          </h3>
          <p className="text-sm mt-1 text-txt-muted">
            {t("settings.snooze_description")}
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-lg p-1 bg-surf-secondary">
            <button
              className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-all"
              style={{
                backgroundColor: !show_snoozed
                  ? "var(--bg-card)"
                  : "transparent",
                color: !show_snoozed
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                boxShadow: !show_snoozed
                  ? "0 1px 2px rgba(0,0,0,0.05)"
                  : "none",
              }}
              onClick={() => {
                set_show_snoozed(false);
                set_selected_ids(new Set());
              }}
            >
              {t("settings.active_count", {
                count: String(displayed_stats.total),
              })}
            </button>
            <button
              className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-all"
              style={{
                backgroundColor: show_snoozed
                  ? "var(--bg-card)"
                  : "transparent",
                color: show_snoozed
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                boxShadow: show_snoozed ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
              onClick={() => {
                set_show_snoozed(true);
                set_selected_ids(new Set());
              }}
            >
              {t("settings.snoozed_count", {
                count: String(displayed_stats.snoozed),
              })}
            </button>
          </div>
          <div className="flex gap-2">
            {selected_ids.size > 0 && !show_snoozed && (
              <Button
                className="gap-2 text-white border-0 hover:opacity-90"
                disabled={is_unsubscribing}
                size="md"
                style={{ backgroundColor: SNOOZE_COLOR }}
                onClick={handle_unsubscribe}
              >
                {is_unsubscribing ? (
                  <Spinner size="md" />
                ) : (
                  <SnoozeIcon size={16} />
                )}
                {t("settings.snooze_count", {
                  count: String(selected_ids.size),
                })}
              </Button>
            )}
            <Button
              className="gap-2"
              disabled={is_scanning}
              size="md"
              variant="outline"
              onClick={handle_scan}
            >
              {is_scanning ? (
                <Spinner size="md" />
              ) : (
                <MagnifyingGlassIcon className="w-4 h-4" />
              )}
              {is_scanning && scan_progress
                ? t("settings.scanning_progress", {
                    processed: String(scan_progress.processed),
                    total: String(scan_progress.total),
                  })
                : t("settings.scan_inbox")}
            </Button>
          </div>
        </div>

        {subscriptions.length === 0 ? (
          <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
            {show_snoozed ? (
              <SnoozeIcon className="mx-auto mb-2 text-txt-muted" size={24} />
            ) : (
              <CheckIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
            )}
            <p className="text-sm text-txt-muted">
              {show_snoozed
                ? t("settings.no_snoozed_senders")
                : t("settings.no_subscriptions_detected")}
            </p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-edge-secondary">
            {subscriptions.map((sub, index) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none transition-colors"
                role="button"
                style={{
                  backgroundColor: selected_ids.has(sub.id)
                    ? `${SNOOZE_COLOR}10`
                    : "transparent",
                  borderTop:
                    index > 0 ? "1px solid var(--border-secondary)" : "none",
                }}
                tabIndex={0}
                onClick={() => !show_snoozed && handle_select(index)}
                onKeyDown={(e) => {
                  if (e["key"] === "Enter" || e["key"] === " ") {
                    e.preventDefault();
                    if (!show_snoozed) handle_select(index);
                  }
                }}
                onMouseEnter={(e) => {
                  if (!selected_ids.has(sub.id)) {
                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!selected_ids.has(sub.id)) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                {!show_snoozed && (
                  <Checkbox
                    checked={selected_ids.has(sub.id)}
                    onCheckedChange={() => handle_select(index)}
                  />
                )}

                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: get_domain_color(sub.domain.toLowerCase()),
                  }}
                >
                  <span className="text-[13px] font-semibold text-white leading-none">
                    {get_domain_initial(sub.domain.toLowerCase())}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium truncate text-txt-primary">
                      {sub.sender_name}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                      style={{
                        backgroundColor: `${CATEGORY_COLORS[sub.category]}15`,
                        color: CATEGORY_COLORS[sub.category],
                      }}
                    >
                      {t(CATEGORY_LABEL_KEYS[sub.category] || "settings.other")}
                    </span>
                  </div>
                  <p className="text-[12px] truncate text-txt-muted">
                    {sub.sender_email}
                  </p>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-[12px] font-medium tabular-nums text-txt-secondary">
                      {t("settings.emails_count", {
                        count: String(sub.email_count),
                      })}
                    </p>
                    <div className="flex items-center gap-1 justify-end">
                      <CalendarIcon className="w-3 h-3 text-txt-muted" />
                      <span className="text-[11px] text-txt-muted">
                        {format_date(sub.last_received)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {sub.has_list_unsubscribe && (
                      <div
                        className="p-1.5 rounded"
                        title={t("settings.one_click_unsubscribe_supported")}
                      >
                        <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                      </div>
                    )}
                    {sub.unsubscribe_link && (
                      <a
                        className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
                        href={sub.unsubscribe_link}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={t("settings.open_unsubscribe_page")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowTopRightOnSquareIcon className="w-4 h-4 text-txt-muted" />
                      </a>
                    )}
                    {show_snoozed && (
                      <Button
                        className="ml-2"
                        size="md"
                        variant="outline"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handle_reactivate(sub.id);
                        }}
                      >
                        {t("settings.reactivate")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UpgradeGate>
  );
}
