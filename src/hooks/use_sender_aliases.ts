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
  list_all_aliases,
  decrypt_aliases,
  compute_alias_hash,
  type DecryptedEmailAlias,
} from "@/services/api/aliases";
import {
  list_domains,
  list_domain_addresses,
  decrypt_domain_addresses,
  compute_address_hash,
  compute_address_routing_hash,
  type CustomDomain,
} from "@/services/api/domains";
import { type User } from "@/services/account_manager";
import { resolve_current_user } from "@/services/current_identity";
import {
  has_passphrase_in_memory,
  get_derived_encryption_key,
  get_vault_from_memory,
  on_keys_ready,
} from "@/services/crypto/memory_key_store";
import { is_primary_address } from "@/services/crypto/address_identity_entry";
import { list_external_accounts } from "@/services/api/external_accounts";
import { MAIL_EVENTS, mail_event_bus } from "@/hooks/mail_events";
import {
  list_ghost_aliases,
  decrypt_ghost_aliases,
} from "@/services/api/ghost_aliases";
import { register_ghost_email } from "@/stores/ghost_alias_store";
import {
  clear_local_address_avatars,
  set_local_address_avatars,
} from "@/services/local_address_avatars";
import { is_sendable_address } from "@/utils/sender_address";
import {
  CATCH_ALL_FEATURE,
  catch_all_sender_options,
  set_catch_all_context,
} from "@/services/catch_all_sender";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  clear_sender_trust_context,
  set_trust_own_addresses,
} from "@/lib/sender_trust_store";
import { clear_sender_trust_caches } from "@/lib/sender_trust";
import {
  clear_own_addresses,
  set_own_addresses,
} from "@/services/calendar/own_addresses";

export type SenderOptionType =
  "primary" | "alias" | "domain" | "external" | "ghost";

export interface SenderOption {
  id: string;
  email: string;
  display_name?: string;
  type: SenderOptionType;
  is_enabled: boolean;
  address_hash?: string;
  is_catch_all?: boolean;
  domain_name?: string;
  profile_picture?: string;
}

export const SIGNATURE_BINDABLE_SENDER_TYPES: SenderOptionType[] = [
  "alias",
  "domain",
  "ghost",
];

export function is_signature_bindable_sender_type(
  type: SenderOptionType,
): boolean {
  return SIGNATURE_BINDABLE_SENDER_TYPES.includes(type);
}

export function is_signature_bindable_sender(option: SenderOption): boolean {
  return (
    is_signature_bindable_sender_type(option.type) &&
    option.is_enabled &&
    !option.is_catch_all
  );
}

export async function build_alias_hash_map(
  aliases: DecryptedEmailAlias[],
  compute: (
    local_part: string,
    domain: string,
  ) => Promise<string> = compute_alias_hash,
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();

  for (const alias of aliases) {
    const hash =
      alias.alias_address_hash ||
      (await compute(alias.local_part, alias.domain));

    hashes.set(alias.id, hash);
  }

  return hashes;
}

async function resolve_primary_user(): Promise<User | null> {
  return resolve_current_user();
}

let cached_aliases: DecryptedEmailAlias[] = [];
let cached_alias_hashes: Map<string, string> = new Map();
let cached_domain_options: SenderOption[] = [];
let cached_catch_all_domains: CustomDomain[] = [];
let cached_pending_domain_names: string[] = [];
let cached_disabled_addresses: string[] = [];
let cached_external_options: SenderOption[] = [];
let cached_ghost_options: SenderOption[] = [];
let cached_user: User | null = null;
let cached_domain_routing_tokens: Map<string, string> = new Map();
let cache_populated = false;
let cache_loaded_at = 0;
let pending_cache_load: Promise<void> | null = null;

const CACHE_REFRESH_INTERVAL_MS = 60_000;

interface SenderAliasLoadObserver {
  on_fetch_start?: () => void;
  on_progress?: () => void;
}

function publish_local_address_avatars(): void {
  const values = [
    ...(cached_user?.email && cached_user.profile_picture
      ? [
          {
            email: cached_user.email,
            profile_picture: cached_user.profile_picture,
            display_name: cached_user.display_name,
          },
        ]
      : []),
    ...cached_aliases.map((alias) => ({
      email: alias.full_address,
      profile_picture: alias.profile_picture,
      display_name: alias.display_name,
    })),
    ...[...cached_domain_options, ...cached_ghost_options].map((option) => ({
      email: option.email,
      profile_picture: option.profile_picture,
      display_name: option.display_name,
    })),
  ];

  set_local_address_avatars(values);
}

export function clear_sender_aliases_cache(): void {
  cached_aliases = [];
  cached_alias_hashes = new Map();
  cached_domain_options = [];
  cached_catch_all_domains = [];
  cached_pending_domain_names = [];
  cached_disabled_addresses = [];
  cached_external_options = [];
  cached_ghost_options = [];
  cached_user = null;
  cached_domain_routing_tokens = new Map();
  cache_populated = false;
  cache_loaded_at = 0;
  clear_sender_trust_context();
  clear_sender_trust_caches();
  set_catch_all_context([], []);
  clear_own_addresses();
  clear_local_address_avatars();
}

async function load_sender_alias_caches(
  observer?: SenderAliasLoadObserver,
): Promise<void> {
  const primary_user = await resolve_primary_user();

  if (primary_user) {
    cached_user = primary_user;
    observer?.on_progress?.();
  }

  if (!has_passphrase_in_memory() || !get_derived_encryption_key()) {
    return;
  }

  observer?.on_fetch_start?.();

  const resolved_user = primary_user ?? cached_user;

  cached_user = resolved_user;
  observer?.on_progress?.();

  const alias_result = await list_all_aliases();
  const disabled_addresses: string[] = [];

  if (!alias_result.error) {
    const decrypted = await decrypt_aliases(alias_result.aliases);
    const enabled_aliases = decrypted.filter((a) => a.is_enabled);

    for (const alias of decrypted) {
      if (!alias.is_enabled) disabled_addresses.push(alias.full_address);
    }

    const hashes = await build_alias_hash_map(enabled_aliases);

    cached_aliases = enabled_aliases;
    cached_alias_hashes = hashes;
    observer?.on_progress?.();
  }

  const domains_response = await list_domains();
  const active_domains = (domains_response.data?.domains ?? []).filter(
    (d) => d.status === "active",
  );

  if (!domains_response.error) {
    const pending_names = (domains_response.data?.domains ?? [])
      .filter((d) => d.status !== "active")
      .map((d) => d.domain_name.toLowerCase());

    cached_pending_domain_names = pending_names;
    observer?.on_progress?.();
  }

  const domain_sender_options: SenderOption[] = [];
  const domain_routing_tokens = new Map<string, string>();

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
      if (!addr.is_enabled) {
        disabled_addresses.push(`${addr.local_part}@${domain.domain_name}`);
        continue;
      }

      const hash =
        addr.local_part_hash ||
        (await compute_address_hash(addr.local_part, domain.domain_name));

      domain_routing_tokens.set(
        await compute_address_routing_hash(addr.local_part, domain.domain_name),
        `${addr.local_part}@${domain.domain_name}`,
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

  const domain_fetch_failed =
    Boolean(domains_response.error) ||
    address_results.some((result) => Boolean(result.error));

  if (!domain_fetch_failed || cached_domain_options.length === 0) {
    cached_domain_options = domain_sender_options;
    cached_domain_routing_tokens = domain_routing_tokens;
    cached_catch_all_domains = active_domains;
    cached_disabled_addresses = disabled_addresses;
    observer?.on_progress?.();
  }

  const ghost_response = await list_ghost_aliases();

  const ghost_sender_options: SenderOption[] = [];

  if (ghost_response.data?.aliases) {
    const decrypted_ghosts = await decrypt_ghost_aliases(
      ghost_response.data.aliases,
    );

    for (const g of decrypted_ghosts) {
      const ghost_hash =
        g.alias_address_hash ||
        (await compute_alias_hash(g.local_part, g.domain));
      const ghost_sender: SenderOption = {
        id: `ghost-${g.id}`,
        email: g.full_address,
        type: "ghost",
        is_enabled: g.is_enabled,
        address_hash: ghost_hash,
      };

      register_ghost_email(g.full_address, ghost_sender);

      if (g.is_enabled) {
        ghost_sender_options.push(ghost_sender);
      }
    }
  }

  if (!ghost_response.error || cached_ghost_options.length === 0) {
    cached_ghost_options = ghost_sender_options;
    observer?.on_progress?.();
  }

  const external_response = await list_external_accounts();

  if (external_response.data) {
    const enabled_externals = external_response.data.filter(
      (a) => a.is_enabled && !a.oauth_provider && !a.email.endsWith("@import"),
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
    observer?.on_progress?.();
  } else if (!external_response.error || cached_external_options.length === 0) {
    cached_external_options = [];
    observer?.on_progress?.();
  }

  cache_populated = true;
  cache_loaded_at = Date.now();
  set_catch_all_context(cached_catch_all_domains, [
    cached_user?.email,
    ...cached_aliases.map((a) => a.full_address),
    ...[
      ...cached_domain_options,
      ...cached_ghost_options,
      ...cached_external_options,
    ].map((o) => o.email),
    ...cached_disabled_addresses,
  ]);
  set_trust_own_addresses([
    cached_user?.email,
    ...cached_aliases.map((a) => a.full_address),
    ...[
      ...cached_domain_options,
      ...cached_ghost_options,
      ...cached_external_options,
    ].map((o) => o.email),
    ...cached_disabled_addresses,
  ]);
  set_own_addresses(
    [
      cached_user?.email,
      ...cached_aliases.map((a) => a.full_address),
      ...[
        ...cached_domain_options,
        ...cached_ghost_options,
        ...cached_external_options,
      ].map((o) => o.email),
      ...cached_disabled_addresses,
    ],
    cached_catch_all_domains
      .filter(
        (d) => d.status === "active" && d.catch_all_enabled && !d.is_shared,
      )
      .map((d) => d.domain_name),
  );
  publish_local_address_avatars();
  publish_own_address_entries();
}

function publish_own_address_entries(): void {
  const vault = get_vault_from_memory();
  const primary = cached_user?.email;

  if (!vault?.ratchet_identity_key || !primary) return;

  const addresses = [
    ...cached_aliases.map((a) => a.full_address),
    ...[...cached_domain_options, ...cached_ghost_options].map((o) => o.email),
  ].filter(
    (address): address is string =>
      Boolean(address) && !is_primary_address(address, primary),
  );

  if (addresses.length === 0) return;

  void import("@/services/crypto/address_identity_directory")
    .then(({ publish_address_entries }) =>
      publish_address_entries(vault, addresses),
    )
    .catch(() => undefined);
}

export function is_sender_alias_cache_populated(): boolean {
  return cache_populated;
}

export function has_cached_secondary_addresses(): boolean {
  return (
    cached_aliases.length > 0 ||
    cached_domain_options.length > 0 ||
    cached_ghost_options.length > 0 ||
    cached_external_options.length > 0 ||
    cached_disabled_addresses.length > 0 ||
    cached_catch_all_domains.length > 0
  );
}

export function ensure_sender_alias_caches(options?: {
  refresh?: boolean;
}): Promise<void> {
  const is_fresh = Date.now() - cache_loaded_at < CACHE_REFRESH_INTERVAL_MS;

  if (cache_populated && (!options?.refresh || is_fresh)) {
    return Promise.resolve();
  }

  if (!pending_cache_load) {
    pending_cache_load = load_sender_alias_caches()
      .catch(() => undefined)
      .finally(() => {
        pending_cache_load = null;
      });
  }

  return pending_cache_load;
}

export function use_sender_aliases(
  candidates: (string | null | undefined)[] = [],
) {
  const { is_feature_locked } = use_plan_limits();
  const [catch_all_domains, set_catch_all_domains] = useState(
    cached_catch_all_domains,
  );
  const [pending_domain_names, set_pending_domain_names] = useState(
    cached_pending_domain_names,
  );
  const [disabled_addresses, set_disabled_addresses] = useState(
    cached_disabled_addresses,
  );
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
  const [ghost_options, set_ghost_options] =
    useState<SenderOption[]>(cached_ghost_options);
  const [loading, set_loading] = useState(!cache_populated);
  const [user, set_user] = useState<User | null>(cached_user);

  const sync_from_cache = useCallback(() => {
    set_user(cached_user);
    set_aliases(cached_aliases);
    set_alias_hashes(cached_alias_hashes);
    set_pending_domain_names(cached_pending_domain_names);
    set_domain_options(cached_domain_options);
    set_catch_all_domains(cached_catch_all_domains);
    set_disabled_addresses(cached_disabled_addresses);
    set_ghost_options(cached_ghost_options);
    set_external_options(cached_external_options);
  }, []);

  const load_aliases = useCallback(async () => {
    try {
      await load_sender_alias_caches({
        on_fetch_start: () => {
          if (!cache_populated) set_loading(true);
        },
        on_progress: sync_from_cache,
      });
    } catch {
      sync_from_cache();
    } finally {
      set_loading(false);
    }
  }, [sync_from_cache]);

  useEffect(() => {
    load_aliases();
  }, [load_aliases]);

  useEffect(() => {
    return on_keys_ready(() => {
      if (!cache_populated) load_aliases();
    });
  }, [load_aliases]);

  useEffect(() => {
    const unsub = mail_event_bus.subscribe_multiple(
      [
        MAIL_EVENTS.REFRESH_REQUESTED,
        MAIL_EVENTS.MAIL_CHANGED,
        MAIL_EVENTS.AUTH_READY,
        MAIL_EVENTS.ALIASES_CHANGED,
      ],
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
    ...ghost_options,
  ].filter((option) => is_sendable_address(option.email));

  return {
    sender_options: [
      ...sender_options,
      ...(!is_feature_locked(CATCH_ALL_FEATURE)
        ? catch_all_sender_options(
            catch_all_domains,
            candidates,
            sender_options,
            disabled_addresses,
          )
        : []),
    ],
    pending_domain_names,
    loading,
    refresh: load_aliases,
  };
}

export function get_cached_alias_for_routing_token(
  routing_token: string | undefined,
): string | undefined {
  if (!routing_token) return undefined;

  for (const [alias_id, hash] of cached_alias_hashes) {
    if (hash === routing_token) {
      const alias = cached_aliases.find((a) => a.id === alias_id);

      return alias?.full_address;
    }
  }

  return undefined;
}

export interface CachedSenderIdentity {
  email: string;
  address_hash: string;
  display_name?: string;
}

export function get_cached_sender_identity_for_address(
  address: string | undefined,
): CachedSenderIdentity | undefined {
  const target = address?.trim().toLowerCase();

  if (!target) return undefined;

  for (const alias of cached_aliases) {
    if (alias.full_address?.trim().toLowerCase() !== target) continue;

    const address_hash = cached_alias_hashes.get(alias.id);

    if (!address_hash) return undefined;

    return {
      email: alias.full_address,
      address_hash,
      display_name: alias.display_name,
    };
  }

  for (const option of [
    ...cached_domain_options,
    ...cached_external_options,
    ...cached_ghost_options,
  ]) {
    if (option.email?.trim().toLowerCase() !== target) continue;
    if (!option.address_hash) return undefined;

    return {
      email: option.email,
      address_hash: option.address_hash,
      display_name: option.display_name,
    };
  }

  return undefined;
}

export function get_cached_sender_identity_for_routing_token(
  routing_token: string | undefined,
): CachedSenderIdentity | undefined {
  if (!routing_token) return undefined;

  return get_cached_sender_identity_for_address(
    get_cached_alias_for_routing_token(routing_token) ??
      get_cached_ghost_for_routing_token(routing_token) ??
      cached_domain_routing_tokens.get(routing_token),
  );
}

export function get_cached_ghost_for_routing_token(
  routing_token: string | undefined,
): string | undefined {
  if (!routing_token) return undefined;

  const match = cached_ghost_options.find(
    (g) => g.address_hash === routing_token,
  );

  return match?.email;
}
