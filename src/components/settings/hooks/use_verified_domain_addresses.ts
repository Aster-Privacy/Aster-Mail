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
  list_domains,
  list_domain_addresses,
  decrypt_domain_addresses,
} from "@/services/api/domains";
import {
  has_passphrase_in_memory,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { MAIL_EVENTS } from "@/hooks/mail_events";

const DEFAULT_DOMAINS = [
  "astermail.org",
  "aster.cx",
  "astermail.me",
  "astermail.net",
];

export interface VerifiedDomainAddress {
  value: string;
  domain_name: string;
  local_part: string;
}

export function use_verified_domain_addresses() {
  const [addresses, set_addresses] = useState<VerifiedDomainAddress[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [load_failed, set_load_failed] = useState(false);

  const load = useCallback(async () => {
    if (!has_passphrase_in_memory() || !get_derived_encryption_key()) {
      set_addresses([]);
      set_load_failed(false);
      set_is_loading(false);

      return;
    }

    set_is_loading(true);
    set_load_failed(false);

    try {
      const response = await list_domains();

      if (!response.data) {
        set_addresses([]);
        set_load_failed(true);

        return;
      }

      const active = response.data.domains.filter(
        (d) =>
          d.status === "active" &&
          !DEFAULT_DOMAINS.includes(d.domain_name.toLowerCase()),
      );

      if (active.length === 0) {
        set_addresses([]);

        return;
      }

      const responses = await Promise.all(
        active.map((d) => list_domain_addresses(d.id)),
      );

      const all: VerifiedDomainAddress[] = [];

      let any_failed = false;

      for (let i = 0; i < active.length; i++) {
        const data = responses[i].data;

        if (!data) {
          any_failed = true;
          continue;
        }

        const decrypted = await decrypt_domain_addresses(
          data.addresses.filter((a) => a.is_enabled),
        );

        for (const addr of decrypted) {
          all.push({
            value: `${addr.local_part}@${active[i].domain_name}`,
            domain_name: active[i].domain_name,
            local_part: addr.local_part,
          });
        }
      }

      all.sort((a, b) => a.value.localeCompare(b.value));
      set_addresses(all);
      set_load_failed(any_failed && all.length === 0);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_addresses([]);
      set_load_failed(true);
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const handle_auth_ready = () => {
      load();
    };

    window.addEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);

    return () => {
      window.removeEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
    };
  }, [load]);

  return { addresses, is_loading, load_failed, reload: load };
}
