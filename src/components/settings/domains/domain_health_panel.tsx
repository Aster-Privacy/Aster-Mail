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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import {
  check_label_key,
  check_status_key,
  format_checked_at,
  hero_copy,
  should_keep_polling,
  sort_checks,
} from "@/lib/domain_health";
import {
  detect_dns_provider,
  provider_dashboard_url,
  type DnsProvider,
} from "@/data/dns_providers";
import {
  get_dns_records,
  get_domain_health,
  type DnsRecord,
  type DomainCheck,
  type DomainHealth,
} from "@/services/api/domains";
import { DnsRecordCard } from "@/components/settings/aliases/dns_record_card";

const POLL_INTERVAL_MS = 15000;

const TONE_STYLES: Record<string, { wrap: string; icon: string }> = {
  ok: {
    wrap: "bg-green-500/10 border-green-500/40",
    icon: "text-green-600 dark:text-green-400",
  },
  warning: {
    wrap: "bg-yellow-500/10 border-yellow-500/40",
    icon: "text-yellow-600 dark:text-yellow-400",
  },
  critical: {
    wrap: "bg-red-500/10 border-red-500/40",
    icon: "text-red-600 dark:text-red-400",
  },
  unknown: {
    wrap: "bg-surf-secondary border-edge-secondary",
    icon: "text-txt-muted",
  },
};

function HeroIcon({ tone, className }: { tone: string; className: string }) {
  if (tone === "ok") return <CheckCircleIcon className={className} />;
  if (tone === "critical") return <XCircleIcon className={className} />;
  if (tone === "warning")
    return <ExclamationTriangleIcon className={className} />;

  return <QuestionMarkCircleIcon className={className} />;
}

function CheckRow({
  check,
  record,
  domain_name,
  provider,
}: {
  check: DomainCheck;
  record: DnsRecord | undefined;
  domain_name: string;
  provider: DnsProvider | null;
}) {
  const { t } = use_i18n();
  const [showing_record, set_showing_record] = useState(false);
  const failed = check.outcome === "fail";

  return (
    <div className="py-3 border-b border-edge-secondary last:border-b-0">
      <div className="flex items-start gap-3">
        {check.outcome === "pass" ? (
          <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
        ) : failed ? (
          <XCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
        ) : (
          <QuestionMarkCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5 text-txt-muted" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-txt-primary">
            {t(check_label_key(check.key))}
          </p>
          <p className="text-[13px] mt-0.5 text-txt-secondary">
            {t(check_status_key(check), {
              detail: check.detail ?? "",
            })}
          </p>
          {failed && record && (
            <button
              className="text-xs mt-1.5 text-[var(--accent-color)] hover:underline"
              type="button"
              onClick={() => set_showing_record((v) => !v)}
            >
              {showing_record
                ? t("settings.domain_fix_hide_record")
                : t("settings.domain_fix_show_record")}
            </button>
          )}
        </div>
      </div>
      {failed && record && showing_record && (
        <div className="mt-2 ml-8">
          <DnsRecordCard
            domain={domain_name}
            provider={provider}
            record={record}
          />
        </div>
      )}
    </div>
  );
}

interface DomainHealthPanelProps {
  domain_id: string;
  domain_name: string;
}

export function DomainHealthPanel({
  domain_id,
  domain_name,
}: DomainHealthPanelProps) {
  const { t, language } = use_i18n();
  const [health, set_health] = useState<DomainHealth | null>(null);
  const [records, set_records] = useState<DnsRecord[]>([]);
  const [provider, set_provider] = useState<DnsProvider | null>(null);
  const [loading, set_loading] = useState(true);
  const [refreshing, set_refreshing] = useState(false);
  const [error, set_error] = useState(false);
  const mounted = useRef(true);

  const load_health = useCallback(
    async (is_manual: boolean) => {
      if (is_manual) set_refreshing(true);

      try {
        const response = await get_domain_health(domain_id);

        if (!mounted.current) return;

        if (response.data) {
          set_health(response.data);
          set_error(false);
        } else {
          set_error(true);
        }
      } catch {
        if (mounted.current) set_error(true);
      } finally {
        if (mounted.current) {
          set_loading(false);
          set_refreshing(false);
        }
      }
    },
    [domain_id],
  );

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    load_health(false);
  }, [load_health]);

  useEffect(() => {
    get_dns_records(domain_id).then((response) => {
      if (mounted.current && response.data) {
        set_records(response.data.records);
      }
    });
  }, [domain_id]);

  useEffect(() => {
    detect_dns_provider(domain_name).then((detected) => {
      if (mounted.current) set_provider(detected);
    });
  }, [domain_name]);

  useEffect(() => {
    if (loading || !should_keep_polling(health)) return;

    const timer = setTimeout(() => load_health(false), POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [health, loading, load_health]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const copy = hero_copy(error ? null : health);
  const tone = TONE_STYLES[copy.tone] ?? TONE_STYLES.unknown;
  const dashboard_url = provider_dashboard_url(provider, domain_name);
  const record_for = (check: DomainCheck) =>
    records.find((r) => r.purpose === check.key);

  return (
    <div>
      <div className={`p-4 rounded-lg border ${tone.wrap}`}>
        <div className="flex items-start gap-3">
          <HeroIcon className={`w-6 h-6 flex-shrink-0 ${tone.icon}`} tone={copy.tone} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-txt-primary">
              {t(copy.title_key, { domain: domain_name })}
            </p>
            <p className="text-[13px] mt-0.5 text-txt-secondary">
              {t(copy.body_key)}
            </p>
          </div>
        </div>
      </div>

      {health && (
        <div className="mt-3">
          {sort_checks(health.checks).map((check) => (
            <CheckRow
              key={check.key}
              check={check}
              domain_name={domain_name}
              provider={provider}
              record={record_for(check)}
            />
          ))}
        </div>
      )}

      {provider && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-txt-muted">
          <span>
            {t("settings.domain_provider_detected", { provider: provider.name })}
          </span>
          {dashboard_url && (
            <a
              className="inline-flex items-center gap-1 text-[var(--accent-color)] hover:underline"
              href={dashboard_url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {t("settings.domain_provider_open", { provider: provider.name })}
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-txt-muted">
          {health && (
            <p>
              {t("settings.domain_health_last_checked", {
                when: format_checked_at(health.checked_at, language),
              })}
            </p>
          )}
          {should_keep_polling(health) && !error && (
            <p className="mt-0.5">{t("settings.domain_health_auto_checking")}</p>
          )}
        </div>
        <Button
          disabled={refreshing}
          size="sm"
          variant="outline"
          onClick={() => load_health(true)}
        >
          <ArrowPathIcon
            className={`w-4 h-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing
            ? t("settings.domain_health_checking")
            : t("settings.domain_health_recheck")}
        </Button>
      </div>
    </div>
  );
}
