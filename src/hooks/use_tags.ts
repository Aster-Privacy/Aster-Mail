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
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import {
  list_tags,
  create_tag,
  update_tag,
  delete_tag,
  get_tag_counts,
  add_tag_to_item,
  remove_tag_from_item,
  type TagDefinition,
  type CreateTagRequest,
  type UpdateTagRequest,
  type ListTagsParams,
} from "@/services/api/tags";
import {
  get_vault_from_memory,
  has_passphrase_in_memory,
} from "@/services/crypto/memory_key_store";
import { emit_tags_changed, MAIL_EVENTS } from "@/hooks/mail_events";
import { use_auth_safe } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";

const HASH_ALG = ["SHA", "256"].join("-");

export interface DecryptedTag {
  id: string;
  tag_token: string;
  name: string;
  color?: string;
  icon?: string;
  sort_order: number;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

interface TagsState {
  tags: DecryptedTag[];
  is_loading: boolean;
  error: string | null;
  total: number;
}

interface TagCounts {
  [tag_token: string]: number;
}

const cached_tags: { data: DecryptedTag[]; total: number } = {
  data: [],
  total: 0,
};

interface UseTagsReturn {
  state: TagsState;
  counts: TagCounts;
  fetch_tags: (params?: ListTagsParams) => Promise<void>;
  fetch_counts: () => Promise<void>;
  create_new_tag: (
    name: string,
    color?: string,
    icon?: string,
  ) => Promise<DecryptedTag | null>;
  update_existing_tag: (
    tag_id: string,
    name?: string,
    color?: string,
    icon?: string,
    sort_order?: number,
  ) => Promise<boolean>;
  delete_existing_tag: (tag_id: string) => Promise<boolean>;
  add_tag_to_email: (email_id: string, tag_token: string) => Promise<boolean>;
  remove_tag_from_email: (
    email_id: string,
    tag_token: string,
  ) => Promise<boolean>;
  get_tag_by_token: (tag_token: string) => DecryptedTag | undefined;
  refresh: () => Promise<void>;
}

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function generate_tag_token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  return array_to_base64(bytes);
}

async function derive_tag_key(identity_key: string): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    identity_key + "astermail-tags-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_tag_field(
  field: string,
  identity_key: string,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_tag_key(identity_key);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(field);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
  };
}

async function decrypt_tag_field(
  encrypted: string,
  nonce: string,
  identity_key: string,
): Promise<string> {
  const key = await derive_tag_key(identity_key);
  const encrypted_data = base64_to_array(encrypted);
  const nonce_data = base64_to_array(nonce);

  const decrypted = await decrypt_aes_gcm_with_fallback(key, encrypted_data, nonce_data);

  return new TextDecoder().decode(decrypted);
}

async function decrypt_tag(
  tag: TagDefinition,
  identity_key: string,
): Promise<DecryptedTag | null> {
  let name = "";
  let color: string | undefined;
  let icon: string | undefined;

  try {
    name = await decrypt_tag_field(
      tag.encrypted_name,
      tag.name_nonce,
      identity_key,
    );
  } catch {
    return null;
  }

  if (tag.encrypted_color && tag.color_nonce) {
    try {
      color = await decrypt_tag_field(
        tag.encrypted_color,
        tag.color_nonce,
        identity_key,
      );
    } catch {
      color = undefined;
    }
  }

  if (tag.encrypted_icon && tag.icon_nonce) {
    try {
      icon = await decrypt_tag_field(
        tag.encrypted_icon,
        tag.icon_nonce,
        identity_key,
      );
    } catch {
      icon = undefined;
    }
  }

  return {
    id: tag.id,
    tag_token: tag.tag_token,
    name,
    color,
    icon,
    sort_order: tag.sort_order,
    item_count: tag.item_count,
    created_at: tag.created_at,
    updated_at: tag.updated_at,
  };
}

export function use_tags(): UseTagsReturn {
  const { t } = use_i18n();
  const auth = use_auth_safe();
  const user = auth?.user ?? null;
  const [state, set_state] = useState<TagsState>({
    tags: cached_tags.data,
    is_loading: cached_tags.data.length === 0,
    error: null,
    total: cached_tags.total,
  });
  const [counts, set_counts] = useState<TagCounts>({});
  const abort_ref = useRef<AbortController | null>(null);
  const prev_user_id_ref = useRef<string | null>(null);

  const fetch_tags = useCallback(
    async (params: ListTagsParams = {}): Promise<void> => {
      if (!has_passphrase_in_memory()) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
        }));

        return;
      }

      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          error: t("common.no_vault_available"),
        }));

        return;
      }

      abort_ref.current?.abort();
      abort_ref.current = new AbortController();

      set_state((prev) => {
        if (prev.tags.length === 0) {
          return { ...prev, is_loading: true, error: null };
        }

        return prev;
      });

      try {
        const response = await list_tags({
          include_counts: true,
          ...params,
        });

        if (response.error || !response.data) {
          set_state((prev) => ({
            ...prev,
            is_loading: false,
            error: response.error || t("common.failed_to_fetch_tags"),
          }));

          return;
        }

        const decrypted_results = await Promise.all(
          response.data.tags.map((tag: TagDefinition) =>
            decrypt_tag(tag, vault.identity_key),
          ),
        );

        const decrypted_tags = decrypted_results.filter(
          (tag): tag is DecryptedTag => tag !== null,
        );

        cached_tags.data = decrypted_tags;
        cached_tags.total = decrypted_tags.length;

        set_state({
          tags: decrypted_tags,
          is_loading: false,
          error: null,
          total: response.data.total,
        });
      } catch (err) {
        set_state((prev) => ({
          ...prev,
          is_loading: false,
          error:
            err instanceof Error
              ? err.message
              : t("common.failed_to_fetch_tags"),
        }));
      }
    },
    [t],
  );

  const fetch_counts = useCallback(async (): Promise<void> => {
    try {
      const response = await get_tag_counts();

      if (response.data) {
        const new_counts: TagCounts = {};

        for (const item of response.data.counts) {
          new_counts[item.tag_token] = item.count;
        }
        set_counts(new_counts);
      }
    } catch {
      return;
    }
  }, []);

  const create_new_tag = useCallback(
    async (
      name: string,
      color?: string,
      icon?: string,
    ): Promise<DecryptedTag | null> => {
      const trimmed_name = name.trim();

      if (!trimmed_name || trimmed_name.length > 100) {
        return null;
      }

      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        return null;
      }

      const duplicate_exists = cached_tags.data.some(
        (tag) => tag.name.toLowerCase() === trimmed_name.toLowerCase(),
      );

      if (duplicate_exists) {
        return null;
      }

      try {
        const tag_token = generate_tag_token();

        const { encrypted: encrypted_name, nonce: name_nonce } =
          await encrypt_tag_field(trimmed_name, vault.identity_key);

        const request: CreateTagRequest = {
          tag_token,
          encrypted_name,
          name_nonce,
        };

        if (color) {
          const { encrypted: encrypted_color, nonce: color_nonce } =
            await encrypt_tag_field(color, vault.identity_key);

          request.encrypted_color = encrypted_color;
          request.color_nonce = color_nonce;
        }

        if (icon) {
          const { encrypted: encrypted_icon, nonce: icon_nonce } =
            await encrypt_tag_field(icon, vault.identity_key);

          request.encrypted_icon = encrypted_icon;
          request.icon_nonce = icon_nonce;
        }

        const response = await create_tag(request);

        if (response.error || !response.data) {
          return null;
        }

        const new_tag: DecryptedTag = {
          id: response.data.id,
          tag_token: response.data.tag_token,
          name: trimmed_name,
          color,
          icon,
          sort_order: 0,
          item_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        set_state((prev) => {
          const updated_tags = [...prev.tags, new_tag];

          cached_tags.data = updated_tags;
          cached_tags.total = updated_tags.length;

          return {
            ...prev,
            tags: updated_tags,
            total: updated_tags.length,
          };
        });

        emit_tags_changed();

        return new_tag;
      } catch {
        return null;
      }
    },
    [],
  );

  const update_existing_tag = useCallback(
    async (
      tag_id: string,
      name?: string,
      color?: string,
      icon?: string,
      sort_order?: number,
    ): Promise<boolean> => {
      const vault = get_vault_from_memory();

      if (!vault?.identity_key) {
        return false;
      }

      try {
        const request: UpdateTagRequest = {};

        if (name !== undefined) {
          const { encrypted, nonce } = await encrypt_tag_field(
            name,
            vault.identity_key,
          );

          request.encrypted_name = encrypted;
          request.name_nonce = nonce;
        }

        if (color !== undefined) {
          const { encrypted, nonce } = await encrypt_tag_field(
            color,
            vault.identity_key,
          );

          request.encrypted_color = encrypted;
          request.color_nonce = nonce;
        }

        if (icon !== undefined) {
          const { encrypted, nonce } = await encrypt_tag_field(
            icon,
            vault.identity_key,
          );

          request.encrypted_icon = encrypted;
          request.icon_nonce = nonce;
        }

        if (sort_order !== undefined) {
          request.sort_order = sort_order;
        }

        const response = await update_tag(tag_id, request);

        if (response.error) {
          return false;
        }

        set_state((prev) => {
          const updated_tags = prev.tags.map((tag) =>
            tag.id === tag_id
              ? {
                  ...tag,
                  ...(name !== undefined && { name }),
                  ...(color !== undefined && { color }),
                  ...(icon !== undefined && { icon }),
                  ...(sort_order !== undefined && { sort_order }),
                  updated_at: new Date().toISOString(),
                }
              : tag,
          );

          cached_tags.data = updated_tags;
          cached_tags.total = updated_tags.length;

          return {
            ...prev,
            tags: updated_tags,
          };
        });

        emit_tags_changed();

        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const delete_existing_tag = useCallback(
    async (tag_id: string): Promise<boolean> => {
      try {
        const response = await delete_tag(tag_id);

        if (response.error) {
          return false;
        }

        set_state((prev) => {
          const updated_tags = prev.tags.filter((tag) => tag.id !== tag_id);

          cached_tags.data = updated_tags;
          cached_tags.total = updated_tags.length;

          return {
            ...prev,
            tags: updated_tags,
            total: updated_tags.length,
          };
        });

        emit_tags_changed();

        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const add_tag_to_email = useCallback(
    async (email_id: string, tag_token: string): Promise<boolean> => {
      set_counts((prev) => ({
        ...prev,
        [tag_token]: (prev[tag_token] || 0) + 1,
      }));

      try {
        const response = await add_tag_to_item(email_id, { tag_token });

        if (response.error) {
          set_counts((prev) => ({
            ...prev,
            [tag_token]: Math.max(0, (prev[tag_token] || 1) - 1),
          }));

          return false;
        }

        return true;
      } catch {
        set_counts((prev) => ({
          ...prev,
          [tag_token]: Math.max(0, (prev[tag_token] || 1) - 1),
        }));

        return false;
      }
    },
    [],
  );

  const remove_tag_from_email = useCallback(
    async (email_id: string, tag_token: string): Promise<boolean> => {
      set_counts((prev) => ({
        ...prev,
        [tag_token]: Math.max(0, (prev[tag_token] || 0) - 1),
      }));

      try {
        const response = await remove_tag_from_item(email_id, tag_token);

        if (response.error) {
          set_counts((prev) => ({
            ...prev,
            [tag_token]: (prev[tag_token] || 0) + 1,
          }));

          return false;
        }

        return true;
      } catch {
        set_counts((prev) => ({
          ...prev,
          [tag_token]: (prev[tag_token] || 0) + 1,
        }));

        return false;
      }
    },
    [],
  );

  const get_tag_by_token = useCallback(
    (tag_token: string): DecryptedTag | undefined => {
      return state.tags.find((tag) => tag.tag_token === tag_token);
    },
    [state.tags],
  );

  const refresh = useCallback(async (): Promise<void> => {
    await fetch_tags();
  }, [fetch_tags]);

  useEffect(() => {
    const current_user_id = user?.id || null;
    const prev_user_id = prev_user_id_ref.current;

    if (
      prev_user_id !== null &&
      current_user_id !== null &&
      prev_user_id !== current_user_id
    ) {
      cached_tags.data = [];
      cached_tags.total = 0;
      set_state({
        tags: [],
        is_loading: true,
        error: null,
        total: 0,
      });
      set_counts({});
    }

    if (current_user_id !== null) {
      prev_user_id_ref.current = current_user_id;
    }
  }, [user?.id]);

  useEffect(() => {
    if (has_passphrase_in_memory()) {
      refresh();
    }

    return () => {
      abort_ref.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    let counts_debounce: ReturnType<typeof setTimeout> | null = null;

    const counts_handler = () => {
      if (counts_debounce) clearTimeout(counts_debounce);
      counts_debounce = setTimeout(() => {
        if (has_passphrase_in_memory()) {
          fetch_counts();
        }
      }, 500);
    };

    const tags_handler = () => {
      if (has_passphrase_in_memory()) {
        fetch_tags();
      }
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, counts_handler);
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, counts_handler);
    window.addEventListener(MAIL_EVENTS.TAGS_CHANGED, tags_handler);

    return () => {
      if (counts_debounce) clearTimeout(counts_debounce);
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, counts_handler);
      window.removeEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, counts_handler);
      window.removeEventListener(MAIL_EVENTS.TAGS_CHANGED, tags_handler);
    };
  }, [fetch_counts, fetch_tags]);

  return {
    state,
    counts,
    fetch_tags,
    fetch_counts,
    create_new_tag,
    update_existing_tag,
    delete_existing_tag,
    add_tag_to_email,
    remove_tag_from_email,
    get_tag_by_token,
    refresh,
  };
}

export type { TagCounts, TagsState };

export { encrypt_tag_field, generate_tag_token };
