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
import { useState, useEffect } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { api_client } from "@/services/api/client";
import { get_user_info } from "@/services/api/auth";
import {
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { generate_recovery_pdf } from "@/services/crypto/recovery_pdf";
import { use_preferences } from "@/contexts/preferences_context";
import {
  publish_key_to_wkd,
  unpublish_key_from_wkd,
  publish_key_to_keyserver,
} from "@/services/api/keys";

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

export interface RecoveryCodesInfo {
  total_codes: number;
  available_codes: number;
  created_at: string | null;
}

interface SaltResponse {
  salt: string;
  totp_required: boolean;
}

interface VerifyPasswordResponse {
  verified: boolean;
  totp_required: boolean;
}

interface RegenerateCodesResponse {
  codes: string[];
  info: RecoveryCodesInfo;
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
  const [recovery_info, set_recovery_info] = useState<RecoveryCodesInfo | null>(
    null,
  );
  const [recovery_codes, set_recovery_codes] = useState<string[] | null>(null);
  const [show_recovery_codes, set_show_recovery_codes] = useState(false);
  const [show_regenerate_confirm, set_show_regenerate_confirm] =
    useState(false);
  const [regenerate_confirm_text, set_regenerate_confirm_text] = useState("");
  const [is_regenerating, set_is_regenerating] = useState(false);
  const [regenerate_password, set_regenerate_password] = useState("");
  const [regenerate_totp_code, set_regenerate_totp_code] = useState("");
  const [regenerate_totp_required, set_regenerate_totp_required] =
    useState(false);
  const [regenerate_error, set_regenerate_error] = useState("");
  const [user_email, set_user_email] = useState<string>("");
  const [codes_key, set_codes_key] = useState(0);

  const format_fingerprint = (fp: string): string => {
    return fp.match(/.{1,4}/g)?.join(" ") || fp;
  };

  const format_date = (date_string: string): string => {
    return new Date(date_string).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const load_encryption_data = async () => {
    try {
      const [key_response, recovery_response, user_response] =
        await Promise.all([
          api_client
            .get<PgpKeyInfo>("/crypto/v1/encryption/pgp-key")
            .catch(() => ({ data: null, error: null })),
          api_client.get<RecoveryCodesInfo>(
            "/crypto/v1/encryption/recovery-status",
          ),
          get_user_info(),
        ]);

      if (key_response.data) {
        set_pgp_key(key_response.data);
      }
      if (recovery_response.data) {
        set_recovery_info(recovery_response.data);
      }
      if (user_response.data?.email) {
        set_user_email(user_response.data.email);
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
      await navigator.clipboard.writeText(pgp_key.fingerprint);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
  };

  const handle_export_public_key = async () => {
    if (!pgp_key) return;

    try {
      const blob = new Blob([pgp_key.public_key_armored], {
        type: "application/pgp-keys",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `aster-public-key-${pgp_key.key_id}.asc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
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

      let armored_key: string | undefined;

      if (
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

        armored_key = new TextDecoder().decode(decrypted);
      } else {
        armored_key = response.data?.private_key_encrypted;
      }

      if (!armored_key) {
        set_export_error(t("settings.failed_export_private_key"));

        return;
      }

      const blob = new Blob([armored_key], {
        type: "application/pgp-keys",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `aster-private-key-${pgp_key.key_id}.asc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
      await navigator.clipboard.writeText(pgp_key.public_key_armored);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
  };

  const handle_download_codes = async () => {
    if (!recovery_codes || recovery_codes.length === 0) return;
    await generate_recovery_pdf(
      user_email || "your-account@astermail.org",
      recovery_codes,
    );
  };

  const handle_copy_all_codes = async () => {
    if (!recovery_codes) return;

    try {
      const codes_text = recovery_codes.join("\n");

      await navigator.clipboard.writeText(codes_text);
      show_toast(t("common.copied_successfully"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
  };

  const handle_regenerate_codes = async () => {
    if (regenerate_confirm_text.toLowerCase() !== "regenerate") {
      return;
    }

    if (!regenerate_password.trim()) {
      set_regenerate_error(t("settings.please_enter_password"));

      return;
    }

    if (regenerate_totp_required && !regenerate_totp_code.trim()) {
      set_regenerate_error(t("settings.please_enter_2fa_code"));

      return;
    }

    set_is_regenerating(true);
    set_regenerate_error("");

    try {
      const salt_response = await api_client.get<SaltResponse>(
        "/crypto/v1/encryption/salt",
        { skip_cache: true },
      );

      if (salt_response.error || !salt_response.data?.salt) {
        set_regenerate_error(t("settings.failed_retrieve_auth"));

        return;
      }

      if (salt_response.data.totp_required && !regenerate_totp_required) {
        set_regenerate_totp_required(true);
        set_regenerate_totp_code("");
        set_is_regenerating(false);

        return;
      }

      const salt = base64_to_array(salt_response.data.salt);
      const { hash } = await derive_password_hash(regenerate_password, salt);

      const body: { password_hash: string; totp_code?: string } = {
        password_hash: hash,
      };

      if (regenerate_totp_required && regenerate_totp_code.trim()) {
        body.totp_code = regenerate_totp_code.trim();
      }

      const verify_response = await api_client.post<VerifyPasswordResponse>(
        "/crypto/v1/encryption/verify-password",
        body,
      );

      if (verify_response.error) {
        set_regenerate_error(verify_response.error);

        return;
      }

      if (!verify_response.data?.verified) {
        set_regenerate_error(t("settings.incorrect_password_error"));

        return;
      }

      const response = await api_client.post<RegenerateCodesResponse>(
        "/crypto/v1/encryption/regenerate-recovery-codes",
        {},
      );

      if (response.data) {
        set_codes_key((prev) => prev + 1);
        set_recovery_codes(response.data.codes);
        set_recovery_info(response.data.info);
        set_show_recovery_codes(true);
        set_show_regenerate_confirm(false);
        set_regenerate_confirm_text("");
        set_regenerate_password("");
        set_regenerate_totp_code("");
        set_regenerate_error("");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_regenerate_error(t("settings.failed_verify_password"));
    } finally {
      set_is_regenerating(false);
    }
  };

  const handle_wkd_toggle = async () => {
    const new_value = !preferences.publish_to_wkd;

    update_preference("publish_to_wkd", new_value);

    if (new_value) {
      const result = await publish_key_to_wkd();

      if (result.error) {
        update_preference("publish_to_wkd", false);
        show_toast(t("settings.failed_publish_wkd"), "error");
      } else {
        show_toast(t("settings.key_published_wkd"), "success");
      }
    } else {
      const result = await unpublish_key_from_wkd();

      if (result.error) {
        update_preference("publish_to_wkd", true);
        show_toast(t("settings.failed_remove_wkd"), "error");
      } else {
        show_toast(t("settings.key_removed_wkd"), "success");
      }
    }
  };

  const handle_keyserver_toggle = async () => {
    const new_value = !preferences.publish_to_keyservers;

    update_preference("publish_to_keyservers", new_value);

    if (new_value) {
      const result = await publish_key_to_keyserver();

      if (result.error) {
        update_preference("publish_to_keyservers", false);
        show_toast(t("settings.failed_publish_keyserver"), "error");
      } else {
        show_toast(t("settings.key_published_keyserver"), "success");
      }
    } else {
      show_toast(t("settings.keys_cannot_remove_keyservers"), "info");
    }
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

  const close_regenerate_confirm = () => {
    set_show_regenerate_confirm(false);
    set_regenerate_confirm_text("");
    set_regenerate_password("");
    set_regenerate_totp_code("");
    set_regenerate_error("");
  };

  const open_regenerate_confirm = () => {
    set_show_regenerate_confirm(true);
  };

  useEffect(() => {
    load_encryption_data();

    return () => {
      set_recovery_codes(null);
      set_export_password("");
      set_export_totp_code("");
    };
  }, []);

  const codes_remaining = recovery_info?.available_codes ?? 0;
  const codes_total = recovery_info?.total_codes ?? 6;
  const codes_used = codes_total - codes_remaining;

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
    recovery_info,
    recovery_codes,
    show_recovery_codes,
    show_regenerate_confirm,
    regenerate_confirm_text,
    set_regenerate_confirm_text,
    is_regenerating,
    regenerate_password,
    set_regenerate_password,
    regenerate_totp_code,
    set_regenerate_totp_code,
    regenerate_totp_required,
    regenerate_error,
    codes_key,
    codes_remaining,
    codes_total,
    codes_used,
    preferences,
    update_preference,
    format_fingerprint,
    format_date,
    handle_copy_fingerprint,
    handle_export_public_key,
    handle_export_secret_key,
    handle_copy_public_key,
    handle_download_codes,
    handle_copy_all_codes,
    handle_regenerate_codes,
    handle_wkd_toggle,
    handle_keyserver_toggle,
    close_export_prompt,
    open_export_prompt,
    close_regenerate_confirm,
    open_regenerate_confirm,
  };
}
