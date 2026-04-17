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
import { useState, useEffect, useCallback } from "react";

import {
  list_aliases,
  decrypt_aliases,
  compute_alias_hash,
  type DecryptedEmailAlias,
} from "@/services/api/aliases";
import {
  list_domains,
  list_domain_addresses,
  decrypt_domain_addresses,
  compute_address_hash,
} from "@/services/api/domains";
import { get_current_account, type User } from "@/services/account_manager";
import { list_external_accounts } from "@/services/api/external_accounts";
import { MAIL_EVENTS, mail_event_bus } from "@/hooks/mail_events";
import {
  list_ghost_aliases,
  decrypt_ghost_aliases,
  GHOST_DOMAIN,
} from "@/services/api/ghost_aliases";
import { register_ghost_email } from "@/stores/ghost_alias_store";

export type SenderOptionType =
  | "primary"
  | "alias"
  | "domain"
  | "external"
  | "ghost";

export interface SenderOption {
  id: string;
  email: string;
  display_name?: string;
  type: SenderOptionType;
  is_enabled: boolean;
  address_hash?: string;
  domain_name?: string;
  profile_picture?: string;
}

let cached_aliases: DecryptedEmailAlias[] = [];
let cached_alias_hashes: Map<string, string> = new Map();
let cached_domain_options: SenderOption[] = [];
let cached_external_options: SenderOption[] = [];
let cached_user: User | null = null;
let cache_populated = false;

export function use_sender_aliases() {
  const [aliases, set_aliases] =
    useState<DecryptedEmailAlias[]>(cached_aliases);
  const [alias_hashes, set_alias_hashes] =
    useState<Map<string, string>>(cached_alias_hashes);
  const [domain_options, set_domain_options] = useState<SenderOption[]>(
    cached_domain_options,
  );
  const [external_options, set_external_options] = useState<SenderOption[]>(
    cached_external_options,
  );
  const [loading, set_loading] = useState(!cache_populated);
  const [user, set_user] = useState<User | null>(cached_user);

  const load_aliases = useCallback(async () => {
    set_loading(true);

    try {
      const account = await get_current_account();

      const resolved_user = account?.user ?? null;

      cached_user = resolved_user;
      set_user(resolved_user);

      const response = await list_aliases({ limit: 100 });

      if (response.data?.aliases) {
        const decrypted = await decrypt_aliases(response.data.aliases);
        const enabled_aliases = decrypted.filter((a) => a.is_enabled);

        const hashes = new Map<string, string>();

        for (const alias of enabled_aliases) {
          const hash = await compute_alias_hash(alias.local_part, alias.domain);

          hashes.set(alias.id, hash);
        }

        cached_aliases = enabled_aliases;
        cached_alias_hashes = hashes;
        set_aliases(enabled_aliases);
        set_alias_hashes(hashes);
      }

      const domains_response = await list_domains();
      const active_domains = (domains_response.data?.domains ?? []).filter(
        (d) => d.status === "active",
      );

      const domain_sender_options: SenderOption[] = [];

      const address_results = await Promise.all(
        active_domains.map((domain) => list_domain_addresses(domain.id)),
      );

      for (let i = 0; i < active_domains.length; i++) {
        const domain = active_domains[i];
        const addr_response = address_results[i];

        if (!addr_response.data?.addresses) continue;

        const decrypted_addresses = await decrypt_domain_addresses(
          addr_response.data.addresses,
        );

        for (const addr of decrypted_addresses) {
          if (!addr.is_enabled) continue;

          const hash = await compute_address_hash(
            addr.local_part,
            domain.domain_name,
          );

          domain_sender_options.push({
            id: `domain-${addr.id}`,
            email: `${addr.local_part}@${domain.domain_name}`,
            display_name: addr.display_name,
            type: "domain",
            is_enabled: true,
            address_hash: hash,
            domain_name: domain.domain_name,
            profile_picture: addr.profile_picture,
          });
        }
      }

      cached_domain_options = domain_sender_options;
      set_domain_options(domain_sender_options);

      const ghost_response = await list_ghost_aliases();

      if (ghost_response.data?.aliases) {
        const decrypted_ghosts = await decrypt_ghost_aliases(
          ghost_response.data.aliases,
        );

        for (const g of decrypted_ghosts) {
          const ghost_hash = await compute_alias_hash(
            g.local_part,
            GHOST_DOMAIN,
          );
          const ghost_sender: SenderOption = {
            id: `ghost-${g.id}`,
            email: g.full_address,
            type: "ghost",
            is_enabled: g.is_enabled,
            address_hash: ghost_hash,
          };

          register_ghost_email(g.full_address, ghost_sender);
        }
      }

      const external_response = await list_external_accounts();

      if (external_response.data) {
        const enabled_externals = external_response.data.filter(
          (a) => a.is_enabled && !a.email.endsWith("@import"),
        );
        const external_sender_options: SenderOption[] = enabled_externals.map(
          (account) => ({
            id: `external-${account.id}`,
            email: account.email,
            display_name: account.display_name || undefined,
            type: "external" as const,
            is_enabled: true,
            address_hash: account.account_token,
          }),
        );

        cached_external_options = external_sender_options;
        set_external_options(external_sender_options);
      } else {
        cached_external_options = [];
        set_external_options([]);
      }

      cache_populated = true;
    } catch {
      set_aliases([]);
      set_alias_hashes(new Map());
      set_domain_options([]);
      set_external_options([]);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_aliases();
  }, [load_aliases]);

  useEffect(() => {
    const unsub = mail_event_bus.subscribe_multiple(
      [MAIL_EVENTS.REFRESH_REQUESTED, MAIL_EVENTS.MAIL_CHANGED],
      load_aliases,
    );

    return unsub;
  }, [load_aliases]);

  const sender_options: SenderOption[] = [
    ...(user
      ? [
          {
            id: "primary",
            email: user.email,
            display_name: user.display_name,
            type: "primary" as const,
            is_enabled: true,
          },
        ]
      : []),
    ...aliases.map((alias) => ({
      id: alias.id,
      email: alias.full_address,
      display_name: alias.display_name,
      type: "alias" as const,
      is_enabled: alias.is_enabled,
      address_hash: alias_hashes.get(alias.id),
      profile_picture: alias.profile_picture,
    })),
    ...domain_options,
    ...external_options,
  ];

  return {
    sender_options,
    loading,
    refresh: load_aliases,
  };
}
