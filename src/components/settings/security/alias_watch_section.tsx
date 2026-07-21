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
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Switch } from "@aster/ui";
import {
  ArrowPathIcon,
  ShieldExclamationIcon,
  ShieldCheckIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";

import { InfoPopover } from "@/components/ui/info_popover";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth_safe } from "@/contexts/auth_context";
import {
  get_cached_aliases,
  get_cached_domain_addresses,
} from "@/components/settings/hooks/use_aliases";
import {
  list_ghost_aliases,
  decrypt_ghost_aliases,
} from "@/services/api/ghost_aliases";
import {
  match_aliases_to_breaches,
  type AliasWatchTarget,
} from "@/services/alias_breach_matcher";
import { get_alias_stats } from "@/services/api/aliases";
import {
  is_alias_watch_enabled,
  set_alias_watch_enabled,
  set_cached_breach_matches,
  get_cached_breach_matches,
  set_last_scan_at,
  get_last_scan_at,
  get_unnotified_matches,
  mark_matches_notified,
  type CachedAliasBreachMatch,
  ALIAS_WATCH_MATCHES_CHANGED_EVENT,
} from "@/services/alias_breach_store";
import { notify_breach_match } from "@/services/api/vanguard";

const MATCH_CYCLE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface CoverageCounts {
  main: number;
  aliases: number;
  ghost_aliases: number;
  domain_addresses: number;
}

const EMPTY_COVERAGE: CoverageCounts = {
  main: 0,
  aliases: 0,
  ghost_aliases: 0,
  domain_addresses: 0,
};

interface SpamSurgeAlert {
  alias_id: string;
  baseline_value: number;
  observed_value: number;
  detected_at: string;
}

async function collect_spam_surge_alerts(
  aliases: { id: string }[],
): Promise<SpamSurgeAlert[]> {
  const results = await Promise.all(
    aliases.map(async (alias) => {
      try {
        const response = await get_alias_stats(alias.id);
        const flag = response.data?.active_flags?.find(
          (f) => f.flag_type === "spam_surge" && f.status === "active",
        );

        if (!flag) return null;

        return {
          alias_id: alias.id,
          baseline_value: flag.baseline_value ?? 0,
          observed_value: flag.observed_value ?? 0,
          detected_at: flag.detected_at,
        } satisfies SpamSurgeAlert;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((alert): alert is SpamSurgeAlert => alert !== null);
}

async function collect_watch_targets(main_address?: string): Promise<{
  targets: AliasWatchTarget[];
  counts: CoverageCounts;
  labels: Record<string, string>;
}> {
  const aliases = get_cached_aliases();
  const domain_addresses = get_cached_domain_addresses();
  const labels: Record<string, string> = {};

  let ghost_targets: AliasWatchTarget[] = [];

  try {
    const ghost_response = await list_ghost_aliases();

    if (ghost_response.data?.aliases) {
      const decrypted = await decrypt_ghost_aliases(ghost_response.data.aliases);

      ghost_targets = decrypted.map((g) => {
        const id = `ghost:${g.id}`;

        labels[id] = g.full_address;

        return { id, local_part: g.local_part };
      });
    }
  } catch {}

  const alias_targets: AliasWatchTarget[] = aliases.map((a) => {
    labels[a.id] = a.full_address;

    return {
      id: a.id,
      local_part: a.local_part,
      display_name: a.display_name,
      note: a.note,
      websites: a.websites,
    };
  });

  const domain_targets: AliasWatchTarget[] = domain_addresses.map((a) => {
    const id = `domain:${a.id}`;

    labels[id] = `${a.local_part}@${a.domain_name}`;

    return {
      id,
      local_part: a.local_part,
      display_name: a.display_name,
    };
  });

  const main_targets: AliasWatchTarget[] = main_address
    ? [{ id: "main", local_part: main_address.split("@")[0] }]
    : [];

  if (main_address) {
    labels["main"] = main_address;
  }

  return {
    targets: [
      ...main_targets,
      ...alias_targets,
      ...ghost_targets,
      ...domain_targets,
    ],
    counts: {
      main: main_targets.length,
      aliases: alias_targets.length,
      ghost_aliases: ghost_targets.length,
      domain_addresses: domain_targets.length,
    },
    labels,
  };
}

export function AliasWatchSection({ account_id }: { account_id: string }) {
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const [enabled, set_enabled] = useState(false);
  const [scanning, set_scanning] = useState(false);
  const [scan_error, set_scan_error] = useState(false);
  const [coverage, set_coverage] = useState<CoverageCounts>(EMPTY_COVERAGE);
  const [matches, set_matches] = useState<CachedAliasBreachMatch[]>([]);
  const [spam_alerts, set_spam_alerts] = useState<SpamSurgeAlert[]>([]);
  const [labels, set_labels] = useState<Record<string, string>>({});
  const [last_scan, set_last_scan] = useState<number | null>(null);

  useEffect(() => {
    if (!account_id) return;
    set_enabled(is_alias_watch_enabled(account_id));
    set_matches(get_cached_breach_matches(account_id));
    set_last_scan(get_last_scan_at(account_id));
  }, [account_id]);

  useEffect(() => {
    const handle_matches_changed = (event: Event) => {
      const detail = (event as CustomEvent<{ account_id: string }>).detail;

      if (detail?.account_id !== account_id) return;
      set_matches(get_cached_breach_matches(account_id));
    };

    window.addEventListener(
      ALIAS_WATCH_MATCHES_CHANGED_EVENT,
      handle_matches_changed,
    );

    return () =>
      window.removeEventListener(
        ALIAS_WATCH_MATCHES_CHANGED_EVENT,
        handle_matches_changed,
      );
  }, [account_id]);

  const run_match_cycle = useCallback(
    async (manual: boolean) => {
      if (!account_id) return;

      set_scanning(true);
      set_scan_error(false);

      let scanned_matches: CachedAliasBreachMatch[] | null = null;
      let scanned_spam_alerts: SpamSurgeAlert[] = [];

      try {
        const { targets, counts, labels: target_labels } =
          await collect_watch_targets(auth?.user?.email);

        set_coverage(counts);
        set_labels(target_labels);

        const found =
          targets.length > 0 ? await match_aliases_to_breaches(targets) : [];

        set_cached_breach_matches(account_id, found);
        scanned_matches = get_cached_breach_matches(account_id);
        set_matches(scanned_matches);

        scanned_spam_alerts = await collect_spam_surge_alerts(
          get_cached_aliases(),
        );

        set_spam_alerts(scanned_spam_alerts);

        const now = Date.now();

        set_last_scan_at(account_id, now);
        set_last_scan(now);

        const unnotified = get_unnotified_matches(account_id, scanned_matches);

        if (unnotified.length > 0) {
          try {
            await notify_breach_match(unnotified.length);
            mark_matches_notified(account_id, unnotified);
          } catch {}
        }
      } catch {
        set_scan_error(true);
        if (manual) {
          show_toast(t("settings.alias_watch_scan_failed"), "error");
        }
      } finally {
        set_scanning(false);
      }

      if (manual && scanned_matches !== null) {
        const total_found = scanned_matches.length + scanned_spam_alerts.length;

        show_toast(
          total_found > 0
            ? t("settings.alias_watch_scan_found", { count: total_found })
            : t("settings.alias_watch_scan_clean"),
          total_found > 0 ? "warning" : "success",
        );
      }
    },
    [account_id, auth?.user?.email, t],
  );

  useEffect(() => {
    if (!enabled || !account_id) return;

    run_match_cycle(false);
    const interval = window.setInterval(
      () => run_match_cycle(false),
      MATCH_CYCLE_INTERVAL_MS,
    );

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, account_id]);

  const handle_toggle = (checked: boolean) => {
    set_enabled(checked);
    set_alias_watch_enabled(account_id, checked);
    if (!checked) {
      set_matches([]);
      set_spam_alerts([]);
      set_last_scan(null);
      set_coverage(EMPTY_COVERAGE);
      set_scan_error(false);
    }
    show_toast(
      checked
        ? t("settings.alias_watch_enabled_toast")
        : t("settings.alias_watch_disabled_toast"),
      "success",
    );
  };

  const total_watched =
    coverage.main +
    coverage.aliases +
    coverage.ghost_aliases +
    coverage.domain_addresses;

  const coverage_stats: { key: keyof CoverageCounts; label: string }[] = [
    { key: "main", label: t("settings.alias_watch_stat_main") },
    { key: "aliases", label: t("settings.alias_watch_stat_aliases") },
    { key: "ghost_aliases", label: t("settings.alias_watch_stat_ghost") },
    {
      key: "domain_addresses",
      label: t("settings.alias_watch_stat_domain"),
    },
  ];

  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.alias_watch_enable")}
            </p>
            <Badge color="gray">{t("settings.alias_watch_beta_badge")}</Badge>
            <InfoPopover
              description={t("settings.alias_watch_info")}
              title={t("settings.alias_watch_title")}
            />
            {enabled && matches.length + spam_alerts.length === 0 && (
              <Badge color="amber">{t("settings.alias_watch_active")}</Badge>
            )}
            {enabled && matches.length + spam_alerts.length > 0 && (
              <Badge color="red">
                {t("settings.alias_watch_matches_found", {
                  count: matches.length + spam_alerts.length,
                })}
              </Badge>
            )}
          </div>
          <p className="text-xs mt-0.5 text-txt-muted">
            {t("settings.alias_watch_description")}
          </p>
        </div>
        <Switch size="lg" checked={enabled} onCheckedChange={handle_toggle} />
      </div>

      {enabled && (
        <div className="mt-3 rounded-lg border border-edge-secondary bg-surf-secondary p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-txt-primary">
              {t("settings.alias_watch_coverage_title", {
                count: total_watched,
              })}
            </p>
            <Button
              disabled={scanning}
              size="sm"
              variant="outline"
              onClick={() => run_match_cycle(true)}
            >
              <ArrowPathIcon
                className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`}
              />
              {scanning
                ? t("settings.alias_watch_scanning")
                : t("settings.alias_watch_scan_now")}
            </Button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {coverage_stats.map(({ key, label }) => (
              <div
                key={key}
                className="rounded-md bg-surf-primary border border-edge-secondary px-2 py-1.5"
              >
                <p className="text-sm font-semibold text-txt-primary tabular-nums">
                  {coverage[key]}
                </p>
                <p className="text-[11px] text-txt-muted leading-tight">
                  {label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <p className="text-[11px] text-txt-muted">
              {last_scan
                ? t("settings.alias_watch_last_scanned", {
                    date: new Date(last_scan).toLocaleString(),
                  })
                : t("settings.alias_watch_never_scanned")}
            </p>
            {scan_error && (
              <p className="text-[11px] text-red-500">
                {t("settings.alias_watch_scan_failed")}
              </p>
            )}
          </div>

          {matches.length + spam_alerts.length > 0 ? (
            <div className="mt-2.5 space-y-1.5">
              {matches.map((match, index) => (
                <div
                  key={`${match.alias_id}-${match.domain}-${match.breach_date}-${index}`}
                  className="flex items-start gap-2 rounded-md bg-red-600 px-2.5 py-2"
                >
                  <ShieldExclamationIcon className="w-4 h-4 text-red-50 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-red-50 truncate">
                      {match.name}
                    </p>
                    <p className="text-[11px] text-red-100 truncate">
                      {labels[match.alias_id] ?? match.alias_id} &middot;{" "}
                      {match.breach_date}
                    </p>
                  </div>
                  <Badge color={match.match_type === "tagged" ? "blue" : "gray"}>
                    {match.match_type === "tagged"
                      ? t("settings.alias_watch_match_tagged")
                      : t("settings.alias_watch_match_automatic")}
                  </Badge>
                </div>
              ))}
              {spam_alerts.map((alert, index) => (
                <div
                  key={`${alert.alias_id}-${alert.detected_at}-${index}`}
                  className="flex items-start gap-2 rounded-md bg-amber-600 px-2.5 py-2"
                >
                  <BoltIcon className="w-4 h-4 text-amber-50 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-amber-50 truncate">
                      {t("settings.alias_watch_spam_surge_title")}
                    </p>
                    <p className="text-[11px] text-amber-100 truncate">
                      {labels[alert.alias_id] ?? alert.alias_id}
                    </p>
                    <p className="text-[11px] text-amber-100 truncate">
                      {t("settings.alias_watch_spam_surge_detail", {
                        baseline: Math.round(alert.baseline_value),
                        observed: Math.round(alert.observed_value),
                      })}
                    </p>
                  </div>
                  <Badge color="amber">
                    {t("settings.alias_watch_spam_surge_badge")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            !scanning &&
            last_scan &&
            !scan_error && (
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-txt-muted">
                <ShieldCheckIcon className="w-3.5 h-3.5 text-txt-muted shrink-0" />
                {t("settings.alias_watch_scan_clean")}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
