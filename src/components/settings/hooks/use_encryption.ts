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
import type { ApiResponse } from "@/services/api/client";
import type {
  KeyserverAddressStatus,
  KeyserverPublicationState,
  KeyserverPublicationStatus,
} from "@/services/api/keys";

import { useState, useEffect, useMemo } from "react";

import { copy_text_or_throw } from "@/utils/copy_text";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { api_client } from "@/services/api/client";
import { ensure_pgp_key_published } from "@/services/crypto/ensure_pgp_key_published";
import {
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { DEFAULT_KEYSERVERS } from "@/components/settings/encryption/encryption_settings_form";
import { trigger_download } from "@/utils/download_blob";
import { use_preferences } from "@/contexts/preferences_context";
import {
  publish_key_to_wkd,
  unpublish_key_from_wkd,
  publish_key_to_keyserver,
  get_keyserver_publication_status,
  clear_external_key_cache,
} from "@/services/api/keys";
import {
  armored_private_key_matches,
  find_unlockable_private_key,
} from "@/services/crypto/key_manager_pgp";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import { ensure_identity_key_addresses } from "@/services/pgp_uid_service";

const KEYSERVER_MAX_ADDRESSES = 10;
const KEYSERVER_POLL_INTERVAL_MS = 60_000;
const KEYSERVER_POLL_MIN_GAP_MS = 15_000;

export interface KeyserverAddressRow {
  email: string;
  selected: boolean;
  disabled: boolean;
  state: KeyserverPublicationState | null;
}

interface KeyserverCandidate {
  email: string;
  name?: string;
  is_primary: boolean;
}

export interface PgpKeyInfo {
  fingerprint: string;
  key_id: string;
  algorithm: string;
  key_size: number;
  created_at: string;
  expires_at: string | null;
  public_key_armored: string;
  decrypt_count: number;
  last_used_decrypt_at: string | null;
}

interface SaltResponse {
  salt: string;
  totp_required: boolean;
}

export function use_encryption() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [is_exporting_private_key, set_is_exporting_private_key] =
    useState(false);
  const [show_export_prompt, set_show_export_prompt] = useState(false);
  const [export_password, set_export_password] = useState("");
  const [export_totp_code, set_export_totp_code] = useState("");
  const [export_error, set_export_error] = useState("");
  const [export_totp_required, set_export_totp_required] = useState(false);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [pgp_key, set_pgp_key] = useState<PgpKeyInfo | null>(null);
  const [pgp_key_load_failed, set_pgp_key_load_failed] = useState(false);
  const [keyserver_urls, set_keyserver_urls] = useState<string[]>([]);
  const [keyservers_loaded, set_keyservers_loaded] = useState(false);
  const [keyserver_input, set_keyserver_input] = useState("");
  const [is_saving_keyservers, set_is_saving_keyservers] = useState(false);
  const [keyserver_published, set_keyserver_published] = useState<
    boolean | null
  >(null);
  const [keyserver_state, set_keyserver_state] =
    useState<KeyserverPublicationState | null>(null);
  const [keyserver_error, set_keyserver_error] = useState<string | null>(null);
  const [is_publishing_keyserver, set_is_publishing_keyserver] =
    useState(false);
  const [keyserver_addresses, set_keyserver_addresses] = useState<
    KeyserverAddressStatus[]
  >([]);
  const [keyserver_selection, set_keyserver_selection] = useState<
    string[] | null
  >(null);
  const { sender_options } = use_sender_aliases();

  const keyserver_candidates = useMemo(() => {
    const seen = new Set<string>();
    const candidates: KeyserverCandidate[] = [];

    for (const option of sender_options) {
      if (!option.is_enabled || option.is_catch_all) continue;
      if (
        option.type !== "primary" &&
        option.type !== "alias" &&
        option.type !== "domain"
      ) {
        continue;
      }

      const email = option.email.trim().toLowerCase();

      if (!email || seen.has(email)) continue;

      seen.add(email);
      candidates.push({
        email,
        name: option.display_name,
        is_primary: option.type === "primary",
      });
    }

    return candidates;
  }, [sender_options]);

  const keyserver_selected = useMemo(() => {
    const available = new Set(
      keyserver_candidates.map((candidate) => candidate.email),
    );

    if (keyserver_selection) {
      return keyserver_selection.filter((email) => available.has(email));
    }

    const requested = keyserver_addresses
      .map((entry) => entry.address.toLowerCase())
      .filter((email) => available.has(email));

    if (requested.length > 0) return requested;

    return keyserver_candidates
      .filter((candidate) => candidate.is_primary)
      .map((candidate) => candidate.email);
  }, [keyserver_candidates, keyserver_selection, keyserver_addresses]);

  const keyserver_address_rows = useMemo(() => {
    const states = new Map(
      keyserver_addresses.map((entry) => [
        entry.address.toLowerCase(),
        entry.state,
      ]),
    );
    const at_limit = keyserver_selected.length >= KEYSERVER_MAX_ADDRESSES;
    const rows: KeyserverAddressRow[] = keyserver_candidates.map(
      (candidate) => {
        const selected = keyserver_selected.includes(candidate.email);

        return {
          email: candidate.email,
          selected,
          disabled: !selected && at_limit,
          state: states.get(candidate.email) ?? null,
        };
      },
    );

    for (const [email, state] of states) {
      if (rows.some((row) => row.email === email)) continue;

      rows.push({ email, selected: false, disabled: true, state });
    }

    return rows;
  }, [keyserver_candidates, keyserver_selected, keyserver_addresses]);

  const keyserver_can_publish =
    keyserver_candidates.length <= 1 || keyserver_selected.length > 0;

  const keyserver_awaiting =
    keyserver_state === "awaiting_verification" ||
    keyserver_addresses.some(
      (entry) => entry.state === "awaiting_verification",
    );

  const handle_keyserver_address_toggle = (email: string) => {
    const target = email.toLowerCase();

    if (keyserver_selected.includes(target)) {
      set_keyserver_selection(
        keyserver_selected.filter((entry) => entry !== target),
      );

      return;
    }

    if (keyserver_selected.length >= KEYSERVER_MAX_ADDRESSES) return;

    set_keyserver_selection([...keyserver_selected, target]);
  };

  const apply_keyserver_status = (status: KeyserverPublicationStatus) => {
    set_keyserver_published(status.published);
    set_keyserver_state(
      status.state ?? (status.published ? "published" : "not_published"),
    );
    set_keyserver_error(status.error ?? null);
    set_keyserver_addresses(status.addresses ?? []);
  };

  const refresh_keyserver_status = async () => {
    const result = await get_keyserver_publication_status().catch(() => ({
      data: null,
      error: "network_error",
    }));

    if (result.data) {
      apply_keyserver_status(result.data);
    }

    return result.data;
  };

  const show_keyserver_publish_result = (
    status: KeyserverPublicationStatus | null | undefined,
  ) => {
    if (!status) {
      show_toast(t("settings.keyserver_publish_unconfirmed"), "info");

      return;
    }

    const state =
      status.state ?? (status.published ? "published" : "not_published");

    if (state === "awaiting_verification") {
      show_toast(t("settings.keyserver_awaiting_hint"), "info");
    } else if (state === "failed") {
      show_toast(t("settings.keyserver_failed_hint"), "error");
    } else if (state === "published") {
      show_toast(t("settings.key_published_keyserver"), "success");
    } else {
      show_toast(t("settings.keyserver_publish_unconfirmed"), "info");
    }
  };
  const format_fingerprint = (fp: string): string => {
    return fp.match(/.{1,4}/g)?.join(" ") || fp;
  };

  const format_date = (date_string: string): string => {
    return new Date(date_string).toLocaleDateString(app_locale(), {
      timeZone: get_display_time_zone(),
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const load_encryption_data = async () => {
    set_pgp_key_load_failed(false);
    try {
      const [key_response, enc_response, keyserver_status, wkd_status] =
        await Promise.all([
          api_client.get<PgpKeyInfo>("/crypto/v1/encryption/pgp-key").catch(
            () =>
              ({
                data: undefined,
                error: "network_error",
              }) as ApiResponse<PgpKeyInfo>,
          ),
          api_client
            .get<{
              auto_discover_keys: boolean;
              encrypt_by_default: boolean;
              require_encryption: boolean;
              ipfs_storage_enabled: boolean;
              keyserver_urls: string[];
            }>("/settings/v1/encryption")
            .catch(() => ({ data: null, error: null })),
          get_keyserver_publication_status().catch(() => ({
            data: null,
            error: null,
          })),
          api_client
            .get<{
              published: boolean;
              url: string | null;
            }>("/crypto/v1/keys/publish/wkd/status")
            .catch(() => ({ data: null, error: null })),
        ]);

      if (key_response.data) {
        set_pgp_key(key_response.data);
      } else if (key_response.code === "NOT_FOUND") {
        const heal_result = await ensure_pgp_key_published({ force: true });

        if (heal_result === "healed") {
          const refetched = await api_client
            .get<PgpKeyInfo>("/crypto/v1/encryption/pgp-key")
            .catch(() => ({ data: undefined }) as ApiResponse<PgpKeyInfo>);

          if (refetched.data) set_pgp_key(refetched.data);
          else set_pgp_key_load_failed(true);
        } else if (heal_result !== "no_local_key") {
          set_pgp_key_load_failed(true);
        }
      } else {
        set_pgp_key_load_failed(true);
      }
      if (enc_response.data) {
        set_keyservers_loaded(true);
        if (
          enc_response.data.auto_discover_keys !==
          preferences.auto_discover_keys
        ) {
          update_preference(
            "auto_discover_keys",
            enc_response.data.auto_discover_keys,
            true,
          );
        }
        if (
          enc_response.data.encrypt_by_default !== preferences.encrypt_emails
        ) {
          update_preference(
            "encrypt_emails",
            enc_response.data.encrypt_by_default,
            true,
          );
        }
        if (
          enc_response.data.require_encryption !==
          preferences.require_encryption
        ) {
          update_preference(
            "require_encryption",
            enc_response.data.require_encryption,
            true,
          );
        }
        set_keyserver_urls(enc_response.data.keyserver_urls ?? []);
        const server_storage_format = enc_response.data.ipfs_storage_enabled
          ? "ipfs"
          : "aster";

        if (server_storage_format !== preferences.storage_format) {
          update_preference("storage_format", server_storage_format, true);
        }
      }

      if (keyserver_status.data) {
        apply_keyserver_status(keyserver_status.data);
      }

      if (
        wkd_status.data &&
        wkd_status.data.published !== preferences.publish_to_wkd
      ) {
        update_preference("publish_to_wkd", wkd_status.data.published, true);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    } finally {
      set_is_initial_load(false);
    }
  };

  const handle_copy_fingerprint = async () => {
    if (!pgp_key) return;

    try {
      await copy_text_or_throw(pgp_key.fingerprint);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const handle_export_public_key = async () => {
    if (!pgp_key) return;

    try {
      const blob = new Blob([pgp_key.public_key_armored], {
        type: "application/pgp-keys",
      });

      trigger_download(blob, `aster-public-key-${pgp_key.key_id}.asc`);
    } catch {
      show_toast(t("common.download_failed"), "error");
    }
  };

  const handle_export_secret_key = async () => {
    if (!pgp_key) return;

    if (!export_password.trim()) {
      set_show_export_prompt(true);

      return;
    }

    if (export_totp_required && !export_totp_code.trim()) {
      set_export_error(t("settings.please_enter_2fa_code"));

      return;
    }

    set_is_exporting_private_key(true);
    set_export_error("");

    try {
      const salt_response = await api_client.get<SaltResponse>(
        "/crypto/v1/encryption/salt",
        { skip_cache: true },
      );

      if (salt_response.error || !salt_response.data?.salt) {
        set_export_error(t("settings.failed_retrieve_auth"));

        return;
      }

      if (salt_response.data.totp_required && !export_totp_required) {
        set_export_totp_required(true);
        set_export_totp_code("");
        set_is_exporting_private_key(false);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash } = await derive_password_hash(export_password, salt);

      const body: {
        include_private: boolean;
        password_hash: string;
        format: string;
        totp_code?: string;
      } = {
        include_private: true,
        password_hash: hash,
        format: "armored",
      };

      if (export_totp_required && export_totp_code.trim()) {
        body.totp_code = export_totp_code.trim();
      }

      const response = await api_client.post<{
        private_key_encrypted?: string;
        fingerprint: string;
        encrypted_private_key_blob?: string;
        private_key_nonce?: string;
        client_side_decryption?: boolean;
      }>("/crypto/v1/keys/pgp/export", body);

      if (response.error) {
        set_export_error(
          response.code === "UNAUTHORIZED"
            ? t("settings.incorrect_password_error")
            : response.error,
        );

        return;
      }

      const vault = get_vault_from_memory();
      let armored_key: string | undefined =
        (await find_unlockable_private_key(
          [vault?.identity_key, ...(vault?.previous_keys ?? [])],
          response.data?.fingerprint ?? "",
          export_password,
        )) ?? undefined;

      if (
        !armored_key &&
        response.data?.client_side_decryption &&
        response.data.encrypted_private_key_blob &&
        response.data.private_key_nonce
      ) {
        const enc_blob = base64_to_array(
          response.data.encrypted_private_key_blob,
        );
        const nonce = base64_to_array(response.data.private_key_nonce);

        const embedded_salt = enc_blob.slice(0, 16);
        const ciphertext = enc_blob.slice(16);

        const encoder = new TextEncoder();
        const key_material = await crypto.subtle.importKey(
          "raw",
          encoder.encode(export_password),
          "PBKDF2",
          false,
          ["deriveKey"],
        );

        const decryption_key = await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: embedded_salt,
            iterations: 310000,
            hash: "SHA-256",
          },
          key_material,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        );

        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: nonce },
          decryption_key,
          ciphertext,
        );

        const opened = new TextDecoder().decode(decrypted);

        armored_key = (await armored_private_key_matches(
          opened,
          response.data.fingerprint ?? "",
        ))
          ? opened
          : undefined;
      }

      if (!armored_key) {
        set_export_error(t("settings.failed_export_private_key"));

        return;
      }

      const blob = new Blob([armored_key], {
        type: "application/pgp-keys",
      });

      trigger_download(blob, `aster-private-key-${pgp_key.key_id}.asc`);

      set_show_export_prompt(false);
      set_export_password("");
      set_export_totp_code("");
      set_export_error("");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_export_error(t("settings.failed_export_private_key"));
    } finally {
      set_is_exporting_private_key(false);
    }
  };

  const handle_copy_public_key = async () => {
    if (!pgp_key) return;

    try {
      await copy_text_or_throw(pgp_key.public_key_armored);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };

  const sync_server_encryption_flag = async (
    field: "auto_discover_keys" | "encrypt_by_default" | "require_encryption",
    value: boolean,
  ): Promise<boolean> => {
    try {
      const response = await api_client.put<{ success: boolean }>(
        "/settings/v1/encryption",
        { [field]: value },
      );

      return !response.error && response.data?.success === true;
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return false;
    }
  };

  const handle_auto_discover_keys_toggle = async () => {
    const new_value = !preferences.auto_discover_keys;

    update_preference("auto_discover_keys", new_value, true);
    const ok = await sync_server_encryption_flag(
      "auto_discover_keys",
      new_value,
    );

    if (!ok) {
      update_preference("auto_discover_keys", !new_value, true);
      show_toast(t("settings.failed_save_setting"), "error");
    } else {
      clear_external_key_cache();
    }
  };

  const handle_storage_format_change = async (format: "aster" | "ipfs") => {
    const previous = preferences.storage_format;

    if (format === previous) return;

    update_preference("storage_format", format, true);

    try {
      const response = await api_client.put<{ success: boolean }>(
        "/settings/v1/encryption",
        { ipfs_storage_enabled: format === "ipfs" },
      );

      if (response.error || response.data?.success !== true) {
        update_preference("storage_format", previous, true);
        show_toast(t("settings.failed_save_setting"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      update_preference("storage_format", previous, true);
      show_toast(t("settings.failed_save_setting"), "error");
    }
  };

  const handle_encrypt_emails_toggle = async () => {
    const new_value = !preferences.encrypt_emails;

    update_preference("encrypt_emails", new_value, true);
    const ok = await sync_server_encryption_flag(
      "encrypt_by_default",
      new_value,
    );

    if (!ok) {
      update_preference("encrypt_emails", !new_value, true);
      show_toast(t("settings.failed_save_setting"), "error");
    } else {
      clear_external_key_cache();
    }
  };

  const handle_require_encryption_toggle = async () => {
    const new_value = !preferences.require_encryption;

    update_preference("require_encryption", new_value, true);
    const ok = await sync_server_encryption_flag(
      "require_encryption",
      new_value,
    );

    if (!ok) {
      update_preference("require_encryption", !new_value, true);
      show_toast(t("settings.failed_save_setting"), "error");
    }
  };

  const handle_wkd_toggle = async () => {
    const new_value = !preferences.publish_to_wkd;

    update_preference("publish_to_wkd", new_value, true);

    if (new_value) {
      const result = await publish_key_to_wkd();

      if (result.error || result.data?.success === false) {
        update_preference("publish_to_wkd", false, true);
        show_toast(t("settings.failed_publish_wkd"), "error");
      } else {
        show_toast(t("settings.key_published_wkd"), "success");
      }
    } else {
      const result = await unpublish_key_from_wkd();

      if (result.error || result.data?.success === false) {
        update_preference("publish_to_wkd", true, true);
        show_toast(t("settings.failed_remove_wkd"), "error");
      } else {
        show_toast(t("settings.key_removed_wkd"), "success");
      }
    }
  };

  const handle_keyserver_toggle = async () => {
    const new_value = !preferences.publish_to_keyservers;

    update_preference("publish_to_keyservers", new_value, true);

    if (new_value) {
      const result = await publish_key_to_keyserver();

      if (result.error) {
        update_preference("publish_to_keyservers", false, true);
        show_toast(t("settings.failed_publish_keyserver"), "error");
        await refresh_keyserver_status();
      } else {
        show_keyserver_publish_result(await refresh_keyserver_status());
      }
    } else {
      show_toast(t("settings.keys_cannot_remove_keyservers"), "info");
    }
  };

  const handle_publish_to_keyservers = async () => {
    if (!keyserver_can_publish) return;

    set_is_publishing_keyserver(true);

    try {
      const selected = keyserver_selected;
      const chosen = keyserver_candidates.filter((candidate) =>
        selected.includes(candidate.email),
      );

      if (chosen.some((candidate) => !candidate.is_primary)) {
        const key_result = await ensure_identity_key_addresses(
          chosen.map((candidate) => ({
            email: candidate.email,
            name: candidate.name,
          })),
          true,
        ).catch(() => "failed" as const);

        if (key_result === "failed") {
          show_toast(t("settings.keyserver_key_update_failed"), "error");

          return;
        }
      }

      const result = await publish_key_to_keyserver(
        selected.length > 0 ? selected : undefined,
      );

      if (result.error || result.data?.success === false) {
        show_toast(t("settings.failed_publish_keyserver"), "error");
        await refresh_keyserver_status();
      } else {
        update_preference("publish_to_keyservers", true, true);
        set_keyserver_selection(null);
        show_keyserver_publish_result(await refresh_keyserver_status());
      }
    } finally {
      set_is_publishing_keyserver(false);
    }
  };

  const save_keyserver_urls = async (
    urls: string[],
    previous: string[],
  ): Promise<void> => {
    set_is_saving_keyservers(true);
    try {
      const response = await api_client.put("/settings/v1/encryption", {
        keyserver_urls: urls,
      });

      if (response.error) {
        set_keyserver_urls(previous);
        show_toast(t("settings.failed_publish_keyserver"), "error");

        return;
      }
      show_toast(t("settings.keyserver_saved"), "success");
    } catch {
      set_keyserver_urls(previous);
      show_toast(t("settings.failed_publish_keyserver"), "error");
    } finally {
      set_is_saving_keyservers(false);
    }
  };

  const handle_add_keyserver = () => {
    if (!keyservers_loaded) {
      show_toast(t("common.something_went_wrong_try_again"), "error");

      return;
    }

    const trimmed = keyserver_input.trim().replace(/\/$/, "");

    if (!trimmed) return;
    try {
      const parsed = new URL(trimmed);

      if (parsed.protocol !== "https:" && parsed.protocol !== "hkps:") {
        show_toast(t("settings.keyserver_invalid_url"), "error");

        return;
      }
    } catch {
      show_toast(t("settings.keyserver_invalid_url"), "error");

      return;
    }
    if (
      keyserver_urls.includes(trimmed) ||
      DEFAULT_KEYSERVERS.includes(trimmed)
    ) {
      set_keyserver_input("");

      return;
    }
    const previous = keyserver_urls;
    const updated = [...keyserver_urls, trimmed];

    set_keyserver_urls(updated);
    set_keyserver_input("");
    void save_keyserver_urls(updated, previous);
  };

  const handle_remove_keyserver = (url: string) => {
    if (!keyservers_loaded) {
      show_toast(t("common.something_went_wrong_try_again"), "error");

      return;
    }

    const previous = keyserver_urls;
    const updated = keyserver_urls.filter((u) => u !== url);

    set_keyserver_urls(updated);
    void save_keyserver_urls(updated, previous);
  };

  const close_export_prompt = () => {
    set_show_export_prompt(false);
    set_export_password("");
    set_export_totp_code("");
    set_export_error("");
  };

  const open_export_prompt = () => {
    set_show_export_prompt(true);
    set_export_error("");
  };

  useEffect(() => {
    load_encryption_data();

    return () => {
      set_export_password("");
      set_export_totp_code("");
    };
  }, []);

  useEffect(() => {
    if (!keyserver_awaiting) return;

    let last_check = Date.now();

    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last_check < KEYSERVER_POLL_MIN_GAP_MS) return;

      last_check = Date.now();
      void refresh_keyserver_status();
    };

    const timer = window.setInterval(recheck, KEYSERVER_POLL_INTERVAL_MS);

    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [keyserver_awaiting]);

  return {
    is_initial_load,
    is_exporting_private_key,
    show_export_prompt,
    export_password,
    set_export_password,
    export_totp_code,
    set_export_totp_code,
    export_error,
    export_totp_required,
    pgp_key,
    pgp_key_load_failed,
    retry_load_encryption_data: load_encryption_data,
    preferences,
    update_preference,
    format_fingerprint,
    format_date,
    handle_copy_fingerprint,
    handle_export_public_key,
    handle_export_secret_key,
    handle_copy_public_key,
    handle_wkd_toggle,
    handle_keyserver_toggle,
    handle_auto_discover_keys_toggle,
    handle_encrypt_emails_toggle,
    handle_require_encryption_toggle,
    handle_storage_format_change,
    close_export_prompt,
    open_export_prompt,
    keyserver_urls,
    keyserver_input,
    set_keyserver_input,
    is_saving_keyservers,
    handle_add_keyserver,
    handle_remove_keyserver,
    keyserver_published,
    keyserver_state,
    keyserver_error,
    is_publishing_keyserver,
    handle_publish_to_keyservers,
    keyserver_address_rows,
    keyserver_can_publish,
    handle_keyserver_address_toggle,
  };
}
