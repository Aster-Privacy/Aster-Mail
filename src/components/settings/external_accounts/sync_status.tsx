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

import {
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import {
  get_sync_progress_state,
  is_syncing as check_is_syncing,
} from "@/services/sync_manager";

interface SyncHealthDotProps {
  account: DecryptedExternalAccount;
  t: UseExternalAccountsReturn["t"];
}

export function SyncHealthDot({ account, t }: SyncHealthDotProps) {
  let dot_color = "var(--text-muted)";
  let dot_label = t("common.never_synced");

  if (account.last_sync_status === "success") {
    dot_color = "rgb(34, 197, 94)";
    dot_label = t("common.last_sync_successful");
  } else if (account.last_sync_status === "error") {
    dot_color = "rgb(239, 68, 68)";
    dot_label = t("common.last_sync_failed");
  }

  return (
    <Tooltip tip={dot_label}>
      <span
        aria-label={dot_label}
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        role="status"
        style={{ backgroundColor: dot_color }}
      />
    </Tooltip>
  );
}

interface SyncStatusIndicatorProps {
  account: DecryptedExternalAccount;
  expanded_error_ids: Set<string>;
  toggle_error_expand: (account_id: string) => void;
  format_sync_time: (date_string: string | null) => string | null;
  t: UseExternalAccountsReturn["t"];
}

export function SyncStatusIndicator({
  account,
  expanded_error_ids,
  toggle_error_expand,
  format_sync_time,
  t,
}: SyncStatusIndicatorProps) {
  const is_syncing = check_is_syncing(account.id);
  const progress = get_sync_progress_state(account.id);

  if (is_syncing || progress) {
    const has_progress = progress && progress.total > 0;
    const percent = has_progress
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

    let label = t("settings.syncing");

    if (progress) {
      if (has_progress) {
        label = t("settings.syncing_progress", {
          processed: String(progress.processed),
          total: String(progress.total),
        });
      } else if (
        progress.status === "fetching" ||
        progress.status === "started"
      ) {
        label = t("settings.fetching_emails");
      }
    }

    return (
      <div className="flex flex-col gap-1 min-w-0" role="status">
        <span className="flex items-center gap-1 text-[11px] text-txt-muted">
          <ArrowPathIcon className="w-3 h-3 animate-spin flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <div className="w-full h-1 rounded-full overflow-hidden bg-edge-secondary">
          {has_progress ? (
            <div
              className="h-full rounded-full"
              style={{
                width: `${percent}%`,
                background: "#3B82F6",
                transition: "width 300ms ease-out",
              }}
            />
          ) : (
            <div
              className="h-full rounded-full animate-pulse"
              style={{
                width: "40%",
                background: "#3B82F6",
                animation: "sync_bar_indeterminate 1.5s ease-in-out infinite",
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (account.last_sync_status === "error") {
    return (
      <button
        aria-expanded={expanded_error_ids.has(account.id)}
        aria-label={t("settings.show_sync_error_details")}
        className="flex items-center gap-1 text-[11px] cursor-pointer bg-transparent border-none p-0"
        style={{ color: "rgb(239, 68, 68)" }}
        type="button"
        onClick={() => toggle_error_expand(account.id)}
      >
        <XCircleIcon className="w-3 h-3" />
        {t("settings.sync_failed")}
        <ChevronDownIcon
          className="w-3 h-3 transition-transform duration-150"
          style={{
            transform: expanded_error_ids.has(account.id)
              ? "rotate(180deg)"
              : "rotate(0deg)",
          }}
        />
      </button>
    );
  }

  if (account.last_sync_status === "success" && account.last_sync_at) {
    return (
      <span
        className="flex items-center gap-1 text-[11px]"
        style={{ color: "rgb(34, 197, 94)" }}
      >
        <CheckCircleIcon className="w-3 h-3" />
        {format_sync_time(account.last_sync_at)}
      </span>
    );
  }

  if (account.last_sync_status === "quota_exceeded" && account.last_sync_at) {
    return (
      <span
        className="flex items-center gap-1 text-[11px]"
        style={{ color: "rgb(234, 179, 8)" }}
      >
        <ExclamationTriangleIcon className="w-3 h-3" />
        {format_sync_time(account.last_sync_at)}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-[11px] text-txt-muted">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
      {t("settings.not_synced")}
    </span>
  );
}
