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
import type { ComponentType, SVGProps } from "react";
import type { DecryptedExternalAccount } from "@/services/api/external_accounts";
import type { UseExternalAccountsReturn } from "@/components/settings/hooks/use_external_accounts";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PauseCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
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
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  {
    bucket: "needs_reauth",
    label: "settings.external_account_health_reauth",
    color: "rgb(245, 158, 11)",
    Icon: ExclamationTriangleIcon,
  },
  {
    bucket: "failing",
    label: "settings.external_account_health_failing",
    color: "rgb(239, 68, 68)",
    Icon: XCircleIcon,
  },
  {
    bucket: "never_synced",
    label: "common.never_synced",
    color: "var(--text-muted)",
    Icon: ClockIcon,
  },
  {
    bucket: "paused",
    label: "common.paused",
    color: "var(--text-muted)",
    Icon: PauseCircleIcon,
  },
  {
    bucket: "healthy",
    label: "settings.external_account_health_ok",
    color: "rgb(34, 197, 94)",
    Icon: CheckCircleIcon,
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

  const present = BUCKETS.filter(({ bucket }) => grouped.has(bucket));

  if (present.length === 0) return null;

  const [worst] = present;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-7 gap-1.5 px-2 text-xs font-medium text-txt-muted"
          size="sm"
          variant="ghost"
        >
          <worst.Icon
            aria-hidden="true"
            className="w-4 h-4 flex-shrink-0"
            style={{ color: worst.color }}
          />
          {t("settings.external_account_health_summary")}
          <ChevronDownIcon
            aria-hidden="true"
            className="w-3.5 h-3.5 flex-shrink-0"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[14rem] max-w-[min(20rem,calc(100vw-1rem))]"
        collisionPadding={8}
      >
        {present.map(({ bucket, label, color, Icon }) => {
          const emails = grouped.get(bucket) ?? [];

          return (
            <DropdownMenuItem
              key={bucket}
              className="flex-col items-stretch gap-0.5"
            >
              <span className="flex items-center gap-2">
                <Icon
                  aria-hidden="true"
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color }}
                />
                <span className="flex-1">{t(label)}</span>
                <span className="tabular-nums text-txt-muted">
                  {emails.length}
                </span>
              </span>
              {emails.map((email) => (
                <span
                  key={email}
                  className="ps-6 text-xs text-txt-muted truncate"
                >
                  {email}
                </span>
              ))}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
