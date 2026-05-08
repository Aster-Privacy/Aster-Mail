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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useState, useCallback, useRef, useEffect } from "react";

import {
  generate_ghost_local_part,
  create_ghost_alias,
  lookup_ghost_for_thread,
  decrypt_ghost_alias,
  list_ghost_aliases,
  decrypt_ghost_aliases,
  GHOST_DOMAIN,
} from "@/services/api/ghost_aliases";
import { compute_alias_hash } from "@/services/api/aliases";
import {
  register_ghost_email,
  get_ghost_sender,
} from "@/stores/ghost_alias_store";
import { array_to_base64 } from "@/services/crypto/envelope";
import { has_csrf_token } from "@/services/api/csrf";
import { api_client } from "@/services/api/client";
import { use_i18n } from "@/lib/i18n/context";

export interface UseGhostModeReturn {
  is_ghost_enabled: boolean;
  is_thread_locked: boolean;
  toggle_ghost_mode: () => void;
  ghost_sender: SenderOption | null;
  ghost_expiry_days: number;
  set_ghost_expiry_days: (days: number) => void;
  is_creating: boolean;
  error: string | null;
}

async function hash_thread_token(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return array_to_base64(new Uint8Array(hash));
}

async function build_ghost_sender(
  id: string,
  email: string,
  local_part: string,
  domain?: string,
): Promise<SenderOption> {
  const hash_domain = domain || email.split("@")[1] || GHOST_DOMAIN;
  const address_hash = await compute_alias_hash(local_part, hash_domain);
  const sender: SenderOption = {
    id: `ghost-${id}`,
    email,
    type: "ghost",
    is_enabled: true,
    address_hash,
  };

  register_ghost_email(email, sender);

  return sender;
}

async function resolve_ghost_sender_from_api(
  target_email: string,
): Promise<SenderOption | null> {
  const response = await list_ghost_aliases();

  if (!response.data?.aliases) return null;

  const decrypted = await decrypt_ghost_aliases(response.data.aliases);
  const match = decrypted.find(
    (g) => g.full_address.toLowerCase() === target_email.toLowerCase(),
  );

  if (!match) return null;

  return build_ghost_sender(match.id, match.full_address, match.local_part);
}

export function use_ghost_mode(
  thread_token?: string,
  thread_ghost_email?: string,
): UseGhostModeReturn {
  const [is_ghost_enabled, set_is_ghost_enabled] = useState(false);
  const [ghost_sender, set_ghost_sender] = useState<SenderOption | null>(null);
  const [ghost_expiry_days, set_ghost_expiry_days] = useState(30);
  const [is_creating, set_is_creating] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const { t } = use_i18n();
  const creating_ref = useRef(false);
  const resolved_ghost_ref = useRef<string | null>(null);

  const is_thread_locked = !!thread_ghost_email;

  useEffect(() => {
    if (!thread_ghost_email) return;
    if (resolved_ghost_ref.current === thread_ghost_email) return;

    let cancelled = false;

    const resolve = async () => {
      const stored = get_ghost_sender(thread_ghost_email);

      if (stored && !cancelled) {
        resolved_ghost_ref.current = thread_ghost_email;
        set_ghost_sender(stored);
        set_is_ghost_enabled(true);

        return;
      }

      try {
        const fetched = await resolve_ghost_sender_from_api(thread_ghost_email);

        if (cancelled) return;

        if (fetched) {
          resolved_ghost_ref.current = thread_ghost_email;
          set_ghost_sender(fetched);
          set_is_ghost_enabled(true);

          return;
        }
      } catch {
        if (cancelled) return;
      }

      const local_part = thread_ghost_email.split("@")[0];

      if (local_part && !cancelled) {
        const fallback = await build_ghost_sender(
          `fallback-${Date.now()}`,
          thread_ghost_email,
          local_part,
        );

        if (!cancelled) {
          resolved_ghost_ref.current = thread_ghost_email;
          set_ghost_sender(fallback);
          set_is_ghost_enabled(true);
        }
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [thread_ghost_email]);

  const activate_ghost_mode = useCallback(async () => {
    if (creating_ref.current) return;

    if (!has_csrf_token()) {
      await api_client.refresh_session();
      if (!has_csrf_token()) {
        set_error(t("common.session_expired_refresh"));

        return;
      }
    }

    if (is_thread_locked) {
      if (ghost_sender) {
        set_is_ghost_enabled(true);

        return;
      }

      creating_ref.current = true;
      set_is_creating(true);
      set_error(null);

      try {
        const fetched = await resolve_ghost_sender_from_api(
          thread_ghost_email!,
        );

        if (fetched) {
          set_ghost_sender(fetched);
          set_is_ghost_enabled(true);
        } else {
          const local_part = thread_ghost_email!.split("@")[0];

          if (local_part) {
            const fallback = await build_ghost_sender(
              `fallback-${Date.now()}`,
              thread_ghost_email!,
              local_part,
            );

            set_ghost_sender(fallback);
            set_is_ghost_enabled(true);
          } else {
            set_error(t("errors.ghost_alias_not_found"));
          }
        }
      } catch {
        set_error(t("errors.failed_to_resolve_ghost_alias"));
      } finally {
        set_is_creating(false);
        creating_ref.current = false;
      }

      return;
    }

    creating_ref.current = true;
    set_is_creating(true);
    set_error(null);

    try {
      const token_hash = thread_token
        ? await hash_thread_token(thread_token)
        : undefined;

      if (token_hash) {
        const lookup = await lookup_ghost_for_thread(token_hash);

        if (lookup.data?.alias) {
          const decrypted = await decrypt_ghost_alias(lookup.data.alias);
          const sender = await build_ghost_sender(
            decrypted.id,
            decrypted.full_address,
            decrypted.local_part,
          );

          set_ghost_sender(sender);
          set_is_ghost_enabled(true);

          return;
        }
      }

      const local_part = generate_ghost_local_part();
      const result = await create_ghost_alias(
        local_part,
        ghost_expiry_days,
        token_hash,
      );

      if (result.data?.success) {
        const ghost_address = `${local_part}@${GHOST_DOMAIN}`;
        const sender = await build_ghost_sender(
          result.data.id,
          ghost_address,
          local_part,
        );

        set_ghost_sender(sender);
        set_is_ghost_enabled(true);
      } else if (result.code === "RATE_LIMIT_EXCEEDED") {
        set_error(t("errors.ghost_alias_rate_limit"));
      } else if (result.code === "CONFLICT") {
        const fallback = await resolve_ghost_sender_from_api(
          thread_ghost_email ?? "",
        );

        if (fallback) {
          set_ghost_sender(fallback);
          set_is_ghost_enabled(true);
        } else {
          set_error(t("errors.ghost_alias_already_exists"));
        }
      } else {
        set_error(result.error ?? t("errors.failed_to_create_ghost_alias"));
      }
    } catch {
      set_error(t("errors.failed_to_activate_ghost_mode"));
    } finally {
      set_is_creating(false);
      creating_ref.current = false;
    }
  }, [
    thread_token,
    thread_ghost_email,
    ghost_expiry_days,
    is_thread_locked,
    ghost_sender,
  ]);

  const toggle_ghost_mode = useCallback(() => {
    if (is_thread_locked) {
      if (is_ghost_enabled) {
        set_is_ghost_enabled(false);
        set_error(null);
      } else if (ghost_sender) {
        set_is_ghost_enabled(true);
      } else {
        activate_ghost_mode();
      }

      return;
    }

    if (is_ghost_enabled) {
      set_is_ghost_enabled(false);
      set_ghost_sender(null);
      set_error(null);
    } else {
      activate_ghost_mode();
    }
  }, [is_ghost_enabled, is_thread_locked, ghost_sender, activate_ghost_mode]);

  return {
    is_ghost_enabled,
    is_thread_locked,
    toggle_ghost_mode,
    ghost_sender,
    ghost_expiry_days,
    set_ghost_expiry_days,
    is_creating,
    error,
  };
}
