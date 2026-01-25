import { useState, useCallback, useEffect, useRef } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  check_rotation_needed,
  perform_key_rotation,
  type RotationCheckResult,
} from "@/services/key_rotation_service";
import {
  store_vault_in_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { show_toast } from "@/components/simple_toast";

export interface KeyRotationState {
  show_modal: boolean;
  key_age_hours: number | null;
  key_fingerprint: string | null;
  current_public_key: string | null;
  is_checking: boolean;
  last_check_error: string | null;
}

export function use_key_rotation() {
  const { user, is_authenticated, has_keys } = use_auth();
  const { preferences } = use_preferences();
  const has_checked_ref = useRef(false);
  const is_rotating_ref = useRef(false);

  const [state, set_state] = useState<KeyRotationState>({
    show_modal: false,
    key_age_hours: null,
    key_fingerprint: null,
    current_public_key: null,
    is_checking: false,
    last_check_error: null,
  });

  const check_rotation = useCallback(async (): Promise<RotationCheckResult> => {
    if (!is_authenticated || !has_keys || !preferences) {
      return {
        needs_rotation: false,
        key_age_hours: null,
        key_fingerprint: null,
        current_public_key: null,
      };
    }

    set_state((prev) => ({
      ...prev,
      is_checking: true,
      last_check_error: null,
    }));

    try {
      const result = await check_rotation_needed(preferences);

      set_state((prev) => ({
        ...prev,
        is_checking: false,
        key_age_hours: result.key_age_hours,
        key_fingerprint: result.key_fingerprint,
        current_public_key: result.current_public_key,
        last_check_error: result.error ?? null,
        show_modal: prev.show_modal || result.needs_rotation,
      }));

      return result;
    } catch (error) {
      const error_message =
        error instanceof Error ? error.message : "Unknown error";

      set_state((prev) => ({
        ...prev,
        is_checking: false,
        last_check_error: error_message,
      }));

      return {
        needs_rotation: false,
        key_age_hours: null,
        key_fingerprint: null,
        current_public_key: null,
        error: error_message,
      };
    }
  }, [is_authenticated, has_keys, preferences]);

  const perform_rotation = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user || !preferences) {
        return false;
      }

      if (is_rotating_ref.current) {
        return false;
      }

      const current_vault = get_vault_from_memory();

      if (!current_vault) {
        show_toast("Session expired. Please log in again.", "error");

        return false;
      }

      let server_public_key = state.current_public_key;

      if (!server_public_key) {
        const status_result = await check_rotation_needed(preferences);

        if (!status_result.current_public_key) {
          show_toast("Failed to retrieve current key from server", "error");

          return false;
        }
        server_public_key = status_result.current_public_key;
      }

      is_rotating_ref.current = true;

      try {
        const result = await perform_key_rotation(
          current_vault,
          password,
          user.email,
          user.display_name ?? user.username ?? "User",
          preferences.key_history_limit,
          server_public_key,
        );

        if (result.success && result.new_vault) {
          await store_vault_in_memory(result.new_vault, password);

          if (result.encrypted_vault && result.vault_nonce) {
            sessionStorage.setItem(
              `astermail_encrypted_vault_${user.id}`,
              result.encrypted_vault,
            );
            sessionStorage.setItem(
              `astermail_vault_nonce_${user.id}`,
              result.vault_nonce,
            );
          }

          set_state((prev) => ({
            ...prev,
            show_modal: false,
            key_age_hours: 0,
            key_fingerprint: result.new_fingerprint ?? prev.key_fingerprint,
          }));

          show_toast("Encryption keys rotated successfully", "success");
          is_rotating_ref.current = false;

          return true;
        } else {
          show_toast(result.error ?? "Failed to rotate keys", "error");
          is_rotating_ref.current = false;

          return false;
        }
      } catch (error) {
        show_toast(
          error instanceof Error ? error.message : "Rotation failed",
          "error",
        );
        is_rotating_ref.current = false;

        return false;
      }
    },
    [user, preferences, state.current_public_key],
  );

  const show_manual_rotation_modal = useCallback(() => {
    set_state((prev) => ({ ...prev, show_modal: true }));
  }, []);

  const close_modal = useCallback(() => {
    set_state((prev) => ({ ...prev, show_modal: false }));
  }, []);

  useEffect(() => {
    if (is_authenticated && has_keys && preferences?.forward_secrecy_enabled) {
      if (!has_checked_ref.current) {
        has_checked_ref.current = true;
        check_rotation();
      }
    } else {
      has_checked_ref.current = false;
    }
  }, [
    is_authenticated,
    has_keys,
    preferences?.forward_secrecy_enabled,
    check_rotation,
  ]);

  return {
    ...state,
    check_rotation,
    perform_rotation,
    show_manual_rotation_modal,
    close_modal,
  };
}
