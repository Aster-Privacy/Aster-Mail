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

import { ServerStackIcon } from "@heroicons/react/24/outline";

import { AccountCard } from "@/components/settings/external_accounts/account_card";

interface AccountListProps {
  accounts: DecryptedExternalAccount[];
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

export function AccountList({
  accounts,
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
}: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
        <ServerStackIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
        <p className="text-sm text-txt-muted">
          {t("settings.no_external_accounts")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-edge-secondary">
      <div className="flex items-center px-4 py-2 border-b border-edge-secondary">
        <span className="text-xs font-medium text-txt-muted">
          {t("settings.external_account_count", {
            count: String(accounts.length),
          })}
        </span>
      </div>
      {accounts.map((account, index) => (
        <AccountCard
          key={account.id}
          account={account}
          expanded_error_ids={expanded_error_ids}
          failed_icons={failed_icons}
          format_sync_time={format_sync_time}
          handle_edit={handle_edit}
          handle_sync={handle_sync}
          handle_toggle={handle_toggle}
          index={index}
          set_failed_icons={set_failed_icons}
          set_purge_target={set_purge_target}
          t={t}
          toggle_error_expand={toggle_error_expand}
        />
      ))}
    </div>
  );
}
