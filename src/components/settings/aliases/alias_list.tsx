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
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";

import { AtSymbolIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  AliasItem,
  DomainAddressItem,
} from "@/components/settings/aliases/alias_card";

interface AliasListProps {
  aliases: DecryptedEmailAlias[];
  domain_addresses: (DecryptedDomainAddress & { domain_name: string })[];
  aliases_loading: boolean;
  toggling_id: string | null;
  alias_deleting_id: string | null;
  domain_addr_deleting_id: string | null;
  on_alias_toggle: (id: string, enabled: boolean) => void;
  on_alias_delete: (id: string) => void;
  on_domain_addr_delete: (id: string, domain_id: string) => void;
  on_avatar_changed?: () => void;
  on_display_name_saved?: (alias_id: string, name: string) => void;
}

export function AliasList({
  aliases,
  domain_addresses,
  aliases_loading,
  toggling_id,
  alias_deleting_id,
  domain_addr_deleting_id,
  on_alias_toggle,
  on_alias_delete,
  on_domain_addr_delete,
  on_avatar_changed,
  on_display_name_saved,
}: AliasListProps) {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const is_avatar_locked = is_feature_locked("has_alias_avatars");

  if (aliases_loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl animate-pulse bg-surf-secondary border border-edge-secondary"
          >
            <div className="w-10 h-10 rounded-full bg-surf-tertiary" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-surf-tertiary" />
              <div className="h-3 w-24 rounded bg-surf-tertiary" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (aliases.length === 0 && domain_addresses.length === 0) {
    return (
      <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
        <AtSymbolIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
        <p className="text-sm text-txt-muted">{t("settings.no_aliases_yet")}</p>
      </div>
    );
  }

  return (
    <>
      {aliases.map((alias) => (
        <AliasItem
          key={alias.id}
          alias={alias}
          deleting={alias_deleting_id === alias.id}
          is_avatar_locked={is_avatar_locked}
          on_avatar_changed={on_avatar_changed}
          on_delete={on_alias_delete}
          on_display_name_saved={on_display_name_saved}
          on_toggle={on_alias_toggle}
          toggling={toggling_id === alias.id}
        />
      ))}
      {domain_addresses.map((addr) => (
        <DomainAddressItem
          key={`da-${addr.id}`}
          address={addr}
          deleting={domain_addr_deleting_id === addr.id}
          is_avatar_locked={is_avatar_locked}
          on_avatar_changed={on_avatar_changed}
          on_delete={on_domain_addr_delete}
        />
      ))}
    </>
  );
}
