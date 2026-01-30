import { useState, useEffect, useCallback } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  ArrowTopRightOnSquareIcon,
  ShieldCheckIcon,
  CalendarIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SnoozeIcon } from "@/components/common/icons";
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

const CATEGORY_COLORS: Record<string, string> = {
  newsletter: "#3b82f6",
  marketing: "#f59e0b",
  social: "#8b5cf6",
  transactional: "#22c55e",
  unknown: "#6b7280",
};

const CATEGORY_LABELS: Record<string, string> = {
  newsletter: "Newsletter",
  marketing: "Marketing",
  social: "Social",
  transactional: "Transactional",
  unknown: "Other",
};

export function SubscriptionsSection() {
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

  useEffect(() => {
    fetch_subscriptions(is_initial_load);
  }, [fetch_subscriptions, is_initial_load]);

  const displayed_stats = {
    total: stats?.active ?? 0,
    snoozed: stats?.unsubscribed ?? 0,
  };

  const handle_select = (id: string) => {
    const new_selected = new Set(selected_ids);

    if (new_selected.has(id)) {
      new_selected.delete(id);
    } else {
      new_selected.add(id);
    }
    set_selected_ids(new_selected);
  };

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

  if (is_initial_load) {
    return (
      <div className="flex items-center justify-center py-16">
        <ArrowPathIcon
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Snooze
        </h3>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Put unwanted subscriptions to sleep. Snoozed senders are filtered from
          your inbox automatically.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div
          className="inline-flex rounded-lg p-1"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <button
            className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-all"
            style={{
              backgroundColor: !show_snoozed ? "var(--bg-card)" : "transparent",
              color: !show_snoozed
                ? "var(--text-primary)"
                : "var(--text-secondary)",
              boxShadow: !show_snoozed ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
            onClick={() => {
              set_show_snoozed(false);
              set_selected_ids(new Set());
            }}
          >
            Active ({displayed_stats.total})
          </button>
          <button
            className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-all"
            style={{
              backgroundColor: show_snoozed ? "var(--bg-card)" : "transparent",
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
            Snoozed ({displayed_stats.snoozed})
          </button>
        </div>
        <div className="flex gap-2">
          {selected_ids.size > 0 && !show_snoozed && (
            <Button
              className="gap-2 text-white border-0 hover:opacity-90"
              disabled={is_unsubscribing}
              size="sm"
              style={{ backgroundColor: SNOOZE_COLOR }}
              onClick={handle_unsubscribe}
            >
              {is_unsubscribing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SnoozeIcon size={16} />
              )}
              Snooze ({selected_ids.size})
            </Button>
          )}
          <Button
            className="gap-2"
            disabled={is_scanning}
            size="sm"
            variant="outline"
            onClick={handle_scan}
          >
            {is_scanning ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <MagnifyingGlassIcon className="w-4 h-4" />
            )}
            {is_scanning && scan_progress
              ? `Scanning (${scan_progress.processed}/${scan_progress.total})`
              : "Scan Inbox"}
          </Button>
        </div>
      </div>

      {subscriptions.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 rounded-lg border"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            {show_snoozed ? (
              <SnoozeIcon size={24} style={{ color: "var(--text-muted)" }} />
            ) : (
              <CheckIcon
                className="w-6 h-6"
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </div>
          <p
            className="text-[14px] font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {show_snoozed ? "No snoozed senders" : "No subscriptions detected"}
          </p>
          <p
            className="text-[13px] text-center max-w-[280px]"
            style={{ color: "var(--text-muted)" }}
          >
            {show_snoozed
              ? "Senders you snooze will appear here"
              : "Click 'Scan Inbox' to detect newsletters and marketing emails"}
          </p>
        </div>
      ) : (
        <div
          className="rounded-lg overflow-hidden border"
          style={{ borderColor: "var(--border-secondary)" }}
        >
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
              onClick={() => !show_snoozed && handle_select(sub.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!show_snoozed) handle_select(sub.id);
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
                  onCheckedChange={() => handle_select(sub.id)}
                />
              )}

              <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-zinc-800">
                <img
                  alt={sub.sender_name}
                  className="w-[18px] h-[18px] object-contain"
                  src={`/api/logos/${encodeURIComponent(sub.domain.toLowerCase())}`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;

                    if (parent) {
                      parent.textContent = "";
                      const span = document.createElement("span");

                      span.className = "text-[12px] font-semibold";
                      span.style.color = CATEGORY_COLORS[sub.category];
                      span.textContent = sub.sender_name
                        .charAt(0)
                        .toUpperCase();
                      parent.appendChild(span);
                    }
                  }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {sub.sender_name}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{
                      backgroundColor: `${CATEGORY_COLORS[sub.category]}15`,
                      color: CATEGORY_COLORS[sub.category],
                    }}
                  >
                    {CATEGORY_LABELS[sub.category]}
                  </span>
                </div>
                <p
                  className="text-[12px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {sub.sender_email}
                </p>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p
                    className="text-[12px] font-medium tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {sub.email_count} emails
                  </p>
                  <div className="flex items-center gap-1 justify-end">
                    <CalendarIcon
                      className="w-3 h-3"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {format_date(sub.last_received)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {sub.has_list_unsubscribe && (
                    <div
                      className="p-1.5 rounded"
                      title="One-click unsubscribe supported"
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
                      title="Open unsubscribe page"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowTopRightOnSquareIcon
                        className="w-4 h-4"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </a>
                  )}
                  {show_snoozed && (
                    <Button
                      className="ml-2"
                      size="sm"
                      variant="outline"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handle_reactivate(sub.id);
                      }}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
