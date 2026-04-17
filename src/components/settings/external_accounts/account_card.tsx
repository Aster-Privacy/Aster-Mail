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
  TrashIcon,
  PencilIcon,
  ArrowPathIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Switch } from "@aster/ui";

import { get_favicon_url } from "@/lib/favicon_url";
import { is_syncing as check_is_syncing } from "@/services/sync_manager";
import {
  SyncHealthDot,
  SyncStatusIndicator,
} from "@/components/settings/external_accounts/sync_status";

interface AccountCardProps {
  account: DecryptedExternalAccount;
  index: number;
  failed_icons: Set<string>;
  set_failed_icons: React.Dispatch<React.SetStateAction<Set<string>>>;
  expanded_error_ids: Set<string>;
  toggle_error_expand: (account_id: string) => void;
  format_sync_time: (date_string: string | null) => string | null;
  handle_toggle: (account: DecryptedExternalAccount) => void;
  handle_sync: (account: DecryptedExternalAccount) => void;
  handle_edit: (account: DecryptedExternalAccount) => void;
  set_purge_target: (account: DecryptedExternalAccount | null) => void;
  t: UseExternalAccountsReturn["t"];
}

export function AccountCard({
  account,
  index,
  failed_icons,
  set_failed_icons,
  expanded_error_ids,
  toggle_error_expand,
  format_sync_time,
  handle_toggle,
  handle_sync,
  handle_edit,
  set_purge_target,
  t,
}: AccountCardProps) {
  return (
    <div className={index > 0 ? "border-t border-edge-secondary" : ""}>
      <div className="flex items-center gap-3 px-4 py-3">
        {(() => {
          const domain = account.email.split("@")[1];
          const icon_ok = domain && !failed_icons.has(domain);

          if (icon_ok) {
            return (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{
                  backgroundColor: account.is_enabled
                    ? `${account.label_color}20`
                    : "var(--bg-tertiary)",
                }}
              >
                <img
                  alt=""
                  className="w-5 h-5 object-contain"
                  src={get_favicon_url(domain)}
                  onError={() => {
                    set_failed_icons((prev) => new Set([...prev, domain]));
                  }}
                />
              </div>
            );
          }

          return (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: account.is_enabled
                  ? account.label_color
                  : "var(--bg-tertiary)",
              }}
            >
              <EnvelopeIcon
                className="w-5 h-5"
                style={{
                  color: account.is_enabled
                    ? account.label_color
                    : "var(--text-muted)",
                }}
              />
            </div>
          );
        })()}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <SyncHealthDot account={account} t={t} />
            <span
              className="text-[13px] font-medium truncate text-txt-primary"
              title={account.email}
            >
              {account.email}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 uppercase font-medium bg-surf-tertiary text-txt-muted">
              {account.protocol}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                backgroundColor: account.is_enabled
                  ? "var(--accent-green-muted)"
                  : "var(--bg-tertiary)",
                color: account.is_enabled
                  ? "var(--accent-green)"
                  : "var(--text-muted)",
              }}
            >
              {account.is_enabled ? t("common.active") : t("common.paused")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {account.display_name && (
              <span
                className="text-[12px] truncate max-w-[150px] text-txt-muted"
                title={account.display_name}
              >
                {account.display_name}
              </span>
            )}
            {account.display_name && (
              <span className="text-[12px] text-txt-muted">&middot;</span>
            )}
            <SyncStatusIndicator
              account={account}
              expanded_error_ids={expanded_error_ids}
              format_sync_time={format_sync_time}
              t={t}
              toggle_error_expand={toggle_error_expand}
            />
            {account.email_count > 0 && (
              <>
                <span className="text-[12px] text-txt-muted">&middot;</span>
                <span className="text-[11px] text-txt-muted">
                  {t("settings.email_count", {
                    count: String(account.email_count),
                  })}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Switch
            aria-label={`${account.is_enabled ? t("common.disable") : t("common.enable")} ${account.email}`}
            checked={account.is_enabled}
            onCheckedChange={() => handle_toggle(account)}
          />
          <Button
            aria-label={`${t("common.sync")} ${account.email}`}
            disabled={check_is_syncing(account.id) || !account.is_enabled}
            size="md"
            variant="ghost"
            onClick={() => handle_sync(account)}
          >
            <ArrowPathIcon
              className={`w-4 h-4 ${check_is_syncing(account.id) ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            aria-label={`${t("common.edit")} ${account.email}`}
            size="md"
            variant="ghost"
            onClick={() => handle_edit(account)}
          >
            <PencilIcon className="w-4 h-4" />
          </Button>
          <Button
            aria-label={`${t("common.delete_mail_from")} ${account.email}`}
            size="md"
            variant="ghost"
            onClick={() => set_purge_target(account)}
          >
            <TrashIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {account.last_sync_status === "error" &&
        expanded_error_ids.has(account.id) && (
          <div className="px-4 pb-3 pt-0" style={{ paddingLeft: "3.75rem" }}>
            <div
              className="px-3 py-2 rounded-lg text-xs"
              role="alert"
              style={{
                backgroundColor: "#dc2626",
                color: "#fff",
              }}
            >
              {t("settings.sync_failed_detail", {
                time:
                  format_sync_time(account.last_sync_at) ||
                  t("common.unknown_time"),
              })}
            </div>
          </div>
        )}
    </div>
  );
}
