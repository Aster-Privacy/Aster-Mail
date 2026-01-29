import { useState, useEffect, useCallback } from "react";

import {
  list_aliases,
  decrypt_aliases,
  compute_alias_hash,
  type DecryptedEmailAlias,
} from "@/services/api/aliases";
import { get_current_account, type User } from "@/services/account_manager";

export interface SenderOption {
  id: string;
  email: string;
  display_name?: string;
  is_alias: boolean;
  is_enabled: boolean;
  alias_hash?: string;
}

export function use_sender_aliases() {
  const [aliases, set_aliases] = useState<DecryptedEmailAlias[]>([]);
  const [alias_hashes, set_alias_hashes] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, set_loading] = useState(true);
  const [user, set_user] = useState<User | null>(null);

  const load_aliases = useCallback(async () => {
    set_loading(true);

    try {
      const account = await get_current_account();

      set_user(account?.user ?? null);

      const response = await list_aliases({ limit: 100 });

      if (response.data?.aliases) {
        const decrypted = await decrypt_aliases(response.data.aliases);
        const enabled_aliases = decrypted.filter((a) => a.is_enabled);

        set_aliases(enabled_aliases);

        const hashes = new Map<string, string>();

        for (const alias of enabled_aliases) {
          const hash = await compute_alias_hash(alias.local_part, alias.domain);

          hashes.set(alias.id, hash);
        }

        set_alias_hashes(hashes);
      }
    } catch {
      set_aliases([]);
      set_alias_hashes(new Map());
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_aliases();
  }, [load_aliases]);

  const sender_options: SenderOption[] = [
    ...(user
      ? [
          {
            id: "primary",
            email: user.email,
            display_name: user.display_name,
            is_alias: false,
            is_enabled: true,
          },
        ]
      : []),
    ...aliases.map((alias) => ({
      id: alias.id,
      email: alias.full_address,
      display_name: alias.display_name,
      is_alias: true,
      is_enabled: alias.is_enabled,
      alias_hash: alias_hashes.get(alias.id),
    })),
  ];

  return {
    sender_options,
    loading,
    refresh: load_aliases,
  };
}
