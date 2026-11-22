//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type {
  DecryptedExternalAccount,
  ExternalSyncMode,
} from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { useState } from "react";

import { TwoWaySyncSection } from "@/components/settings/external_accounts/two_way_sync_section";
import { SourceCleanupSection } from "@/components/settings/external_accounts/source_cleanup_section";
import { ForwardingAddressSection } from "@/components/settings/external_accounts/forwarding_address_section";
import { use_plan_limits } from "@/hooks/use_plan_limits";

interface AccountServerSectionsProps {
  account: DecryptedExternalAccount;
  t: TranslationFn;
}

export function AccountServerSections({
  account,
  t,
}: AccountServerSectionsProps) {
  const { is_feature_locked } = use_plan_limits();
  const [mode, set_mode] = useState<ExternalSyncMode>(
    account.mode === "two_way" ? "two_way" : "server_sync",
  );
  const supports_server_writes =
    account.protocol === "imap" || Boolean(account.oauth_provider);

  return (
    <>
      {supports_server_writes && (
        <TwoWaySyncSection
          account={account}
          is_locked={is_feature_locked("has_two_way_sync")}
          mode={mode}
          t={t}
          on_mode_change={set_mode}
        />
      )}
      {supports_server_writes && (
        <SourceCleanupSection
          account={account}
          is_locked={is_feature_locked("has_source_cleanup")}
          is_two_way={mode === "two_way"}
          t={t}
        />
      )}
      <ForwardingAddressSection account={account} t={t} />
    </>
  );
}
