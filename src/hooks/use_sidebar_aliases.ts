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
import { useState, useCallback, useEffect, useRef } from "react";

import {
  list_aliases,
  decrypt_aliases,
  get_alias_counts,
  reencrypt_alias_local_part,
  compute_routing_hash,
  type DecryptedEmailAlias,
  type EmailAlias,
  type AliasCountsResponse,
} from "@/services/api/aliases";
import {
  list_domains,
  list_domain_addresses,
  decrypt_domain_addresses,
  compute_address_routing_hash,
} from "@/services/api/domains";
import {
  has_passphrase_in_memory,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import { use_auth_safe } from "@/contexts/auth_context";

let repair_attempted = false;

async function attempt_alias_repair(
  failed: EmailAlias[],
  merged: DecryptedEmailAlias[],
): Promise<void> {
  if (repair_attempted || failed.length === 0) return;
  repair_attempted = true;

  const recovery_candidates = [
    { local_part: "timo", domain: "aster.cx" },
    { local_part: "job", domain: "astermail.org" },
    { local_part: "social", domain: "aster.cx" },
    { local_part: "games", domain: "aster.cx" },
    { local_part: "trades", domain: "aster.cx" },
    { local_part: "support", domain: "astermail.org" },
    { local_part: "security", domain: "astermail.org" },
    { local_part: "legal", domain: "astermail.org" },
    { local_part: "abuse", domain: "astermail.org" },
    { local_part: "postmaster", domain: "astermail.org" },
    { local_part: "dmarc", domain: "astermail.org" },
    { local_part: "support", domain: "aster.cx" },
    { local_part: "abuse", domain: "aster.cx" },
    { local_part: "postmaster", domain: "aster.cx" },
  ];

  for (const alias of failed) {
    if (!alias.routing_address_hash) continue;

    for (const candidate of recovery_candidates) {
      try {
        const routing = await compute_routing_hash(
          candidate.local_part,
          candidate.domain,
        );

        if (routing === alias.routing_address_hash) {
          await reencrypt_alias_local_part(alias.id, candidate.local_part);

          merged.push({
            id: alias.id,
            local_part: candidate.local_part,
            alias_address_hash: alias.alias_address_hash,
            domain: alias.domain,
            full_address: `${candidate.local_part}@${alias.domain}`,
            is_enabled: alias.is_enabled,
            is_random: alias.is_random,
            created_at: alias.created_at,
            updated_at: alias.updated_at,
          });
          break;
        }
      } catch {}
    }
  }
}

const cached_aliases: { data: DecryptedEmailAlias[] } = {
  data: [],
};

const alias_subscribers = new Set<() => void>();

function notify_alias_subscribers(): void {
  alias_subscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      return;
    }
  });
}

export function subscribe_aliases(cb: () => void): () => void {
  alias_subscribers.add(cb);

  return () => {
    alias_subscribers.delete(cb);
  };
}

export function get_alias_hash_by_address(address: string): string | null {
  const alias = cached_aliases.data.find((a) => a.full_address === address);

  return alias?.alias_address_hash ?? null;
}

interface UseSidebarAliasesReturn {
  aliases: DecryptedEmailAlias[];
  is_loading: boolean;
  can_create: boolean;
}

export function use_sidebar_aliases(): UseSidebarAliasesReturn {
  const auth = use_auth_safe();
  const user = auth?.user ?? null;
  const [aliases, set_aliases] = useState<DecryptedEmailAlias[]>(
    cached_aliases.data,
  );
  const [is_loading, set_is_loading] = useState(
    cached_aliases.data.length === 0,
  );
  const [can_create, set_can_create] = useState(false);
  const prev_user_id_ref = useRef<string | null>(null);
  const fetch_ref = useRef<(() => Promise<void>) | null>(null);

  const fetch_aliases = useCallback(async () => {
    if (!has_passphrase_in_memory()) {
      set_is_loading(false);

      return;
    }

    if (!get_derived_encryption_key()) {
      set_is_loading(false);

      return;
    }

    try {
      const [list_response, counts_response] = await Promise.all([
        list_aliases({ limit: 50 }),
        get_alias_counts(),
      ]);

      const merged: DecryptedEmailAlias[] = [];

      if (list_response.data) {
        const raw_aliases = list_response.data.aliases;
        const decrypted = await decrypt_aliases(raw_aliases);

        const failed_placeholders = decrypted.filter((a) => a.decryption_failed);

        merged.push(...decrypted.filter((a) => !a.decryption_failed));

        if (failed_placeholders.length > 0) {
          const failed_raw = raw_aliases.filter((a) =>
            failed_placeholders.some((p) => p.id === a.id),
          );

          await attempt_alias_repair(failed_raw, merged);
        }
      }

      try {
        const domains_response = await list_domains();
        const active_domains = (domains_response.data?.domains ?? []).filter(
          (d) => d.status === "active",
        );

        const per_domain = await Promise.all(
          active_domains.map(async (domain) => {
            const addr_response = await list_domain_addresses(domain.id);

            if (!addr_response.data) return [];

            const decrypted_addresses = await decrypt_domain_addresses(
              addr_response.data.addresses,
            );

            return Promise.all(
              decrypted_addresses.map(async (addr) => {
                const full_address = `${addr.local_part}@${domain.domain_name}`;
                const alias_address_hash = await compute_address_routing_hash(
                  addr.local_part,
                  domain.domain_name,
                );

                const synthetic: DecryptedEmailAlias = {
                  id: `domain-${addr.id}`,
                  local_part: addr.local_part,
                  display_name: addr.display_name,
                  alias_address_hash,
                  domain: domain.domain_name,
                  full_address,
                  is_enabled: addr.is_enabled,
                  is_random: false,
                  created_at: addr.created_at,
                  updated_at: addr.created_at,
                };

                return synthetic;
              }),
            );
          }),
        );

        for (const group of per_domain) {
          merged.push(...group);
        }
      } catch {}

      cached_aliases.data = merged;
      set_aliases(merged);
      notify_alias_subscribers();

      if (counts_response.data) {
        const counts = counts_response.data as AliasCountsResponse;

        set_can_create(counts.can_create);
      }

      set_is_loading(false);
    } catch {
      set_is_loading(false);
    }
  }, []);

  fetch_ref.current = fetch_aliases;

  useEffect(() => {
    const current_user_id = user?.id || null;
    const prev_user_id = prev_user_id_ref.current;

    if (
      prev_user_id !== null &&
      current_user_id !== null &&
      prev_user_id !== current_user_id
    ) {
      cached_aliases.data = [];
      set_aliases([]);
      set_is_loading(true);
      set_can_create(false);
    }

    if (current_user_id !== null) {
      prev_user_id_ref.current = current_user_id;
    }
  }, [user?.id]);

  useEffect(() => {
    if (has_passphrase_in_memory()) {
      fetch_aliases();
    }
  }, [fetch_aliases]);

  useEffect(() => {
    const handle_auth_ready = () => {
      fetch_ref.current?.();
    };

    const handle_aliases_changed = () => {
      fetch_ref.current?.();
    };

    window.addEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
    window.addEventListener(
      MAIL_EVENTS.ALIASES_CHANGED,
      handle_aliases_changed,
    );

    return () => {
      window.removeEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
      window.removeEventListener(
        MAIL_EVENTS.ALIASES_CHANGED,
        handle_aliases_changed,
      );
    };
  }, []);

  return {
    aliases,
    is_loading,
    can_create,
  };
}
