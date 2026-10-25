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
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";
import type { UseExternalAccountsReturn } from "@/components/settings/hooks/use_external_accounts";
import type { TranslationKey } from "@/lib/i18n/types";

import { Tooltip } from "@aster/ui";

import {
  get_external_account_state,
  type ExternalAccountHealthState,
} from "@/lib/external_account_health";

type SummaryBucket =
  "needs_reauth" | "failing" | "never_synced" | "paused" | "healthy";

const BUCKETS: {
  bucket: SummaryBucket;
  label: TranslationKey;
  color: string;
}[] = [
  {
    bucket: "needs_reauth",
    label: "settings.external_account_health_reauth",
    color: "rgb(245, 158, 11)",
  },
  {
    bucket: "failing",
    label: "settings.external_account_health_failing",
    color: "rgb(239, 68, 68)",
  },
  {
    bucket: "never_synced",
    label: "common.never_synced",
    color: "var(--text-muted)",
  },
  { bucket: "paused", label: "common.paused", color: "var(--text-muted)" },
  {
    bucket: "healthy",
    label: "settings.external_account_health_ok",
    color: "rgb(34, 197, 94)",
  },
];

function to_bucket(state: ExternalAccountHealthState): SummaryBucket {
  return state === "syncing" ? "healthy" : state;
}

interface AccountHealthSummaryProps {
  accounts: DecryptedExternalAccount[];
  t: UseExternalAccountsReturn["t"];
}

export function AccountHealthSummary({
  accounts,
  t,
}: AccountHealthSummaryProps) {
  const grouped = new Map<SummaryBucket, string[]>();

  for (const account of accounts) {
    const bucket = to_bucket(get_external_account_state(account));
    const emails = grouped.get(bucket) ?? [];

    emails.push(account.email);
    grouped.set(bucket, emails);
  }

  return (
    <div
      aria-label={t("settings.external_account_health_summary")}
      className="flex items-center gap-3 flex-wrap"
      role="group"
    >
      {BUCKETS.map(({ bucket, label, color }) => {
        const emails = grouped.get(bucket);

        if (!emails) return null;

        return (
          <Tooltip key={bucket} tip={emails.join(", ")}>
            <span className="flex items-center gap-1.5 text-xs text-txt-muted">
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              {t(label)}
              <span className="font-medium tabular-nums text-txt-secondary">
                {emails.length}
              </span>
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
