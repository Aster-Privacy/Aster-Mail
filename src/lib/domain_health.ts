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
import type {
  DomainCheck,
  DomainCheckKey,
  DomainHealth,
  DomainHealthSeverity,
} from "@/services/api/domains";

export interface HeroCopy {
  title_key: TranslationKey;
  body_key: TranslationKey;
  tone: DomainHealthSeverity | "unknown";
}

const CHECK_LABEL_KEYS: Record<DomainCheckKey, TranslationKey> = {
  mx: "settings.domain_check_mx_label",
  spf: "settings.domain_check_spf_label",
  dkim: "settings.domain_check_dkim_label",
  dmarc: "settings.domain_check_dmarc_label",
};

const CHECK_PASS_KEYS: Record<DomainCheckKey, TranslationKey> = {
  mx: "settings.domain_check_mx_pass",
  spf: "settings.domain_check_spf_pass",
  dkim: "settings.domain_check_dkim_pass",
  dmarc: "settings.domain_check_dmarc_pass",
};

const REASON_KEYS: Record<string, TranslationKey> = {
  mx_missing: "settings.domain_reason_mx_missing",
  mx_points_elsewhere: "settings.domain_reason_mx_points_elsewhere",
  spf_missing: "settings.domain_reason_spf_missing",
  spf_missing_include: "settings.domain_reason_spf_missing_include",
  spf_duplicate_records: "settings.domain_reason_spf_duplicate_records",
  dkim_missing_or_stale: "settings.domain_reason_dkim_missing_or_stale",
  dmarc_missing: "settings.domain_reason_dmarc_missing",
};

const CHECK_ORDER: DomainCheckKey[] = ["mx", "spf", "dkim", "dmarc"];

export function check_label_key(key: DomainCheckKey): TranslationKey {
  return CHECK_LABEL_KEYS[key];
}

export function check_status_key(check: DomainCheck): TranslationKey {
  if (check.outcome === "pass") return CHECK_PASS_KEYS[check.key];
  if (check.outcome === "unknown") return "settings.domain_check_unknown";

  const mapped = check.reason ? REASON_KEYS[check.reason] : undefined;

  return mapped ?? "settings.domain_check_generic_failure";
}

export function hero_copy(health: DomainHealth | null): HeroCopy {
  if (!health || health.health_status === "unknown") {
    return {
      title_key: "settings.domain_health_unknown_title",
      body_key: "settings.domain_health_unknown_body",
      tone: "unknown",
    };
  }

  if (health.severity === "critical") {
    return {
      title_key: "settings.domain_health_critical_title",
      body_key: "settings.domain_health_critical_body",
      tone: "critical",
    };
  }

  if (health.severity === "warning") {
    return {
      title_key: "settings.domain_health_warning_title",
      body_key: "settings.domain_health_warning_body",
      tone: "warning",
    };
  }

  return {
    title_key: "settings.domain_health_ok_title",
    body_key: "settings.domain_health_ok_body",
    tone: "ok",
  };
}

export function sort_checks(checks: DomainCheck[]): DomainCheck[] {
  const failing = (c: DomainCheck) => (c.outcome === "fail" ? 0 : 1);

  return [...checks].sort((a, b) => {
    const by_state = failing(a) - failing(b);

    if (by_state !== 0) return by_state;

    return CHECK_ORDER.indexOf(a.key) - CHECK_ORDER.indexOf(b.key);
  });
}

export function should_keep_polling(health: DomainHealth | null): boolean {
  if (!health) return true;

  return health.severity !== "ok";
}

export function format_checked_at(iso: string, locale: string): string {
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}
