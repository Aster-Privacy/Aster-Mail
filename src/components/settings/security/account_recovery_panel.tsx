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
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  ClipboardIcon,
  ArrowDownTrayIcon,
  ArchiveBoxIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { Button, Badge } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { api_client } from "@/services/api/client";
import { trigger_download } from "@/services/export/destination";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  get_recovery_methods,
  save_phrase_wrap,
  list_inactive_key_sets,
  fetch_inactive_key_set,
  consume_inactive_key_set,
  type RecoveryMethods,
} from "@/services/api/recovery";
import {
  is_master_key_vault,
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import { get_current_account } from "@/services/account_manager";
import {
  generate_recovery_phrase,
  wrap_vault_with_phrase,
} from "@/services/crypto/recovery_phrase";
import {
  serialize_kek_for_vault,
  prepend_kek_to_list,
  derive_kek_from_password,
} from "@/services/crypto/legacy_keks";
import {
  decrypt_vault,
  encrypt_vault,
  derive_password_hash,
  base64_to_array,
} from "@/services/crypto/key_manager";
import { array_to_base64 } from "@/services/crypto/key_manager_core";
import { reprotect_pgp_key } from "@/services/crypto/key_manager_pgp";
import { store_pending_reencryption } from "@/services/crypto/recovery_reencrypt";
import { update_vault } from "@/services/api/key_rotation";
import {
  auto_rekey_if_needed,
  reset_rekey_flag,
} from "@/services/crypto/auto_rekey";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import type { LegacyDerivedKek } from "@/services/crypto/key_manager_core";

interface SaltResponse {
  salt: string;
  totp_required: boolean;
}

interface VerifyPasswordResponse {
  verified: boolean;
  totp_required: boolean;
}

type PasswordVerifyOutcome =
  | { status: "verified"; password_hash: string }
  | { status: "totp_required" }
  | { status: "error"; message: string };

async function verify_account_password(
  password: string,
  totp_code: string,
  totp_already_required: boolean,
  t: ReturnType<typeof use_i18n>["t"],
): Promise<PasswordVerifyOutcome> {
  const salt_response = await api_client.get<SaltResponse>(
    "/crypto/v1/encryption/salt",
    { skip_cache: true },
  );

  if (salt_response.error || !salt_response.data?.salt) {
    return { status: "error", message: t("settings.failed_retrieve_auth") };
  }

  if (salt_response.data.totp_required && !totp_already_required) {
    return { status: "totp_required" };
  }

  const salt = base64_to_array(salt_response.data.salt);
  const { hash } = await derive_password_hash(password, salt);

  const body: { password_hash: string; totp_code?: string } = {
    password_hash: hash,
  };

  if (totp_already_required && totp_code.trim()) {
    body.totp_code = totp_code.trim();
  }

  const verify_response = await api_client.post<VerifyPasswordResponse>(
    "/crypto/v1/encryption/verify-password",
    body,
  );

  if (verify_response.error) {
    return { status: "error", message: verify_response.error };
  }

  if (!verify_response.data?.verified) {
    return {
      status: "error",
      message: t("settings.incorrect_password_error"),
    };
  }

  return { status: "verified", password_hash: hash };
}

export function AccountRecoveryPanel() {
  const { t } = use_i18n();
  const [methods, set_methods] = useState<RecoveryMethods | null>(null);
  const [mk_available, set_mk_available] = useState(false);

  const [show_phrase_modal, set_show_phrase_modal] = useState(false);
  const [phrase_password, set_phrase_password] = useState("");
  const [phrase_totp_code, set_phrase_totp_code] = useState("");
  const [phrase_totp_required, set_phrase_totp_required] = useState(false);
  const [phrase_error, set_phrase_error] = useState("");
  const [phrase_busy, set_phrase_busy] = useState(false);
  const [generated_phrase, set_generated_phrase] = useState<string | null>(
    null,
  );
  const [verified_password_hash, set_verified_password_hash] = useState("");
  const [phrase_revealed, set_phrase_revealed] = useState(false);
  const [phrase_saved_checked, set_phrase_saved_checked] = useState(false);

  const [show_resurrect_modal, set_show_resurrect_modal] = useState(false);
  const [old_password, set_old_password] = useState("");
  const [resurrect_error, set_resurrect_error] = useState("");
  const [resurrect_busy, set_resurrect_busy] = useState(false);
  const [resurrect_done, set_resurrect_done] = useState(false);

  const refresh_methods = useCallback(async () => {
    const response = await get_recovery_methods();

    if (response.data) {
      set_methods(response.data);
    }
  }, []);

  useEffect(() => {
    refresh_methods();
    set_mk_available(is_master_key_vault(get_vault_from_memory()));
  }, [refresh_methods]);

  const close_phrase_modal = () => {
    set_show_phrase_modal(false);
    set_phrase_password("");
    set_phrase_totp_code("");
    set_phrase_totp_required(false);
    set_phrase_error("");
    set_generated_phrase(null);
    set_phrase_revealed(false);
    set_phrase_saved_checked(false);
    set_verified_password_hash("");
  };

  const open_phrase_modal = () => {
    set_show_phrase_modal(true);
    set_phrase_error("");
  };

  const handle_phrase_verify = async () => {
    if (!phrase_password.trim()) return;

    set_phrase_busy(true);
    set_phrase_error("");

    try {
      const outcome = await verify_account_password(
        phrase_password,
        phrase_totp_code,
        phrase_totp_required,
        t,
      );

      if (outcome.status === "totp_required") {
        set_phrase_totp_required(true);
        set_phrase_totp_code("");

        return;
      }

      if (outcome.status === "error") {
        set_phrase_error(outcome.message);

        return;
      }

      const vault = get_vault_from_memory();

      if (!is_master_key_vault(vault) || !vault?.data_kek) {
        set_phrase_error(t("errors.no_keys_available"));

        return;
      }

      set_verified_password_hash(outcome.password_hash);
      set_generated_phrase(generate_recovery_phrase());
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_phrase_error(t("settings.failed_verify_password"));
    } finally {
      set_phrase_busy(false);
    }
  };

  const handle_phrase_confirm = async () => {
    if (!generated_phrase || !phrase_saved_checked) return;

    set_phrase_busy(true);
    set_phrase_error("");

    try {
      if (!verified_password_hash) {
        set_phrase_error(t("settings.failed_verify_password"));

        return;
      }

      const vault = get_vault_from_memory();

      if (!is_master_key_vault(vault) || !vault?.data_kek) {
        set_phrase_error(t("errors.no_keys_available"));

        return;
      }

      const wrap = await wrap_vault_with_phrase(
        JSON.stringify(vault),
        generated_phrase,
      );

      const response = await save_phrase_wrap(
        verified_password_hash,
        wrap.verifier_hash,
        wrap.wrapped_vault,
        wrap.wrap_nonce,
        wrap.wrap_salt,
      );

      if (response.error || !response.data?.success) {
        set_phrase_error(t("settings.phrase_wrap_save_failed"));

        return;
      }

      await refresh_methods();
      close_phrase_modal();
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_phrase_error(t("settings.phrase_wrap_save_failed"));
    } finally {
      set_phrase_busy(false);
    }
  };

  const handle_copy_phrase = async () => {
    if (!generated_phrase) return;

    try {
      await navigator.clipboard.writeText(generated_phrase);
      show_toast(t("settings.copied_to_clipboard"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
  };

  const handle_download_phrase = () => {
    if (!generated_phrase) return;

    const content = [
      t("settings.recovery_phrase_row"),
      "",
      generated_phrase,
      "",
      t("settings.recovery_phrase_saved_confirm"),
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });

    trigger_download(blob, `astermail-recovery-phrase-${Date.now()}.txt`);
  };

  const close_resurrect_modal = () => {
    set_show_resurrect_modal(false);
    set_old_password("");
    set_resurrect_error("");
    set_resurrect_done(false);
  };

  const handle_resurrect = async () => {
    if (!old_password.trim()) return;

    set_resurrect_busy(true);
    set_resurrect_error("");

    let old_key_bytes: Uint8Array | null = null;

    try {
      const list_response = await list_inactive_key_sets();
      const sets = list_response.data?.inactive_key_sets ?? [];

      if (list_response.error || sets.length === 0) {
        set_resurrect_error(t("settings.resurrection_failed"));

        return;
      }

      const newest = [...sets].sort(
        (a, b) =>
          new Date(b.retired_at).getTime() - new Date(a.retired_at).getTime(),
      )[0];

      const fetch_response = await fetch_inactive_key_set(newest.id);

      if (fetch_response.error || !fetch_response.data) {
        set_resurrect_error(t("settings.resurrection_failed"));

        return;
      }

      let old_vault;

      try {
        old_vault = await decrypt_vault(
          fetch_response.data.encrypted_vault,
          fetch_response.data.vault_nonce,
          old_password,
        );
      } catch {
        set_resurrect_error(t("settings.resurrection_failed"));

        return;
      }

      old_key_bytes = old_vault.data_kek
        ? base64_to_array(old_vault.data_kek)
        : await derive_kek_from_password(old_password);

      const live_vault = get_vault_from_memory();
      const passphrase = get_passphrase_from_memory();

      if (!live_vault || !passphrase) {
        set_resurrect_error(t("errors.session_expired_login"));

        return;
      }

      let merged: LegacyDerivedKek[] = live_vault.legacy_keks
        ? [...live_vault.legacy_keks]
        : [];

      for (const entry of old_vault.legacy_keks ?? []) {
        merged = prepend_kek_to_list(merged, entry);
      }

      merged = prepend_kek_to_list(
        merged,
        serialize_kek_for_vault(old_key_bytes),
      );

      live_vault.legacy_keks = merged;

      if (!live_vault.previous_keys) {
        live_vault.previous_keys = [];
      }
      for (const old_prev of [
        old_vault.identity_key,
        ...(old_vault.previous_keys ?? []),
      ]) {
        if (!old_prev) continue;

        let carried = old_prev;

        try {
          carried = await reprotect_pgp_key(old_prev, old_password, passphrase);
        } catch {}
        if (!live_vault.previous_keys.includes(carried)) {
          live_vault.previous_keys.push(carried);
        }
      }
      live_vault.previous_keys = live_vault.previous_keys.slice(0, 20);

      const merged_ratchet_previous = [
        ...(live_vault.ratchet_previous_keys ?? []),
        ...(old_vault.ratchet_previous_keys ?? []),
      ];

      if (
        old_vault.ratchet_identity_key &&
        old_vault.ratchet_identity_public &&
        old_vault.ratchet_signed_prekey &&
        old_vault.ratchet_signed_prekey_public
      ) {
        merged_ratchet_previous.unshift({
          ratchet_identity_key: old_vault.ratchet_identity_key,
          ratchet_identity_public: old_vault.ratchet_identity_public,
          ratchet_signed_prekey: old_vault.ratchet_signed_prekey,
          ratchet_signed_prekey_public: old_vault.ratchet_signed_prekey_public,
          ratchet_pq_identity_key: old_vault.ratchet_pq_identity_key,
          ratchet_pq_identity_public: old_vault.ratchet_pq_identity_public,
        });
      }

      if (merged_ratchet_previous.length > 0) {
        const seen = new Set<string>();

        live_vault.ratchet_previous_keys = merged_ratchet_previous
          .filter((set) => {
            if (seen.has(set.ratchet_identity_public)) return false;
            seen.add(set.ratchet_identity_public);
            return true;
          })
          .slice(0, 10);
      }

      const { encrypted_vault, vault_nonce } = await encrypt_vault(
        live_vault,
        passphrase,
      );

      const current_account = await get_current_account();
      const update_result = await update_vault(
        encrypted_vault,
        vault_nonce,
        live_vault.vault_format ?? 1,
        current_account?.user?.id,
      );

      if (!update_result.success) {
        set_resurrect_error(
          update_result.error ?? t("settings.resurrection_failed"),
        );

        return;
      }

      await store_pending_reencryption({
        old_data_kek: array_to_base64(old_key_bytes),
        old_identity_key: old_vault.identity_key,
      });

      await store_vault_in_memory(live_vault, passphrase);
      reset_rekey_flag();
      auto_rekey_if_needed().catch(() => {});

      const consume_result = await consume_inactive_key_set(newest.id);

      if (consume_result.error) {
        set_resurrect_error(t("settings.resurrection_failed"));

        return;
      }

      await refresh_methods();

      set_resurrect_done(true);
      set_old_password("");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      set_resurrect_error(t("settings.resurrection_failed"));
    } finally {
      if (old_key_bytes) {
        zero_uint8_array(old_key_bytes);
      }
      set_resurrect_busy(false);
    }
  };

  const has_protection = !!methods && (methods.has_phrase || methods.has_codes);
  const phrase_words = generated_phrase ? generated_phrase.split(" ") : [];

  return (
    <div className="space-y-4">
      {methods && (
        <div
          className={
            has_protection
              ? "flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20"
              : "flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20"
          }
        >
          {has_protection ? (
            <ShieldCheckIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          ) : (
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p
              className={
                has_protection
                  ? "text-sm font-medium text-green-600 dark:text-green-400"
                  : "text-sm font-medium text-amber-600 dark:text-amber-400"
              }
            >
              {has_protection
                ? t("settings.recovery_status_protected")
                : t("settings.recovery_status_at_risk")}
            </p>
            <p className="text-xs mt-0.5 text-txt-muted">
              {has_protection
                ? t("settings.recovery_status_protected_desc")
                : t("settings.recovery_status_at_risk_desc")}
            </p>
          </div>
        </div>
      )}

      {mk_available && (
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-2">
              {t("settings.recovery_phrase_row")}
              {methods?.has_phrase ? (
                <Badge color="green">
                  {t("settings.recovery_phrase_active")}
                </Badge>
              ) : (
                <Badge color="gray">
                  {t("settings.recovery_phrase_not_set")}
                </Badge>
              )}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.recovery_phrase_row_desc")}
            </p>
            {methods?.has_phrase && (
              <p className="text-xs mt-1 text-amber-500">
                {t("settings.recovery_phrase_regenerate_warning")}
              </p>
            )}
          </div>
          <Button variant="depth" onClick={open_phrase_modal}>
            <KeyIcon className="w-3.5 h-3.5" />
            {methods?.has_phrase
              ? t("settings.recovery_phrase_regenerate")
              : t("settings.recovery_phrase_generate")}
          </Button>
        </div>
      )}

      {methods?.has_codes && (
        <div className="py-4 border-t border-edge-secondary">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.legacy_codes_row")}
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("settings.legacy_codes_row_desc")}
          </p>
        </div>
      )}

      {(methods?.inactive_key_sets ?? 0) > 0 && (
        <div className="flex items-center justify-between py-4 border-t border-edge-secondary">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.recover_older_data_title")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.recover_older_data_desc")}
            </p>
          </div>
          <Button
            variant="depth"
            onClick={() => set_show_resurrect_modal(true)}
          >
            <ArchiveBoxIcon className="w-3.5 h-3.5" />
            {t("settings.recover_older_data_button")}
          </Button>
        </div>
      )}

      <Modal is_open={show_phrase_modal} on_close={close_phrase_modal} size="md">
        <ModalHeader>
          <ModalTitle>{t("settings.recovery_phrase_row")}</ModalTitle>
          <ModalDescription>
            {generated_phrase
              ? t("settings.recovery_phrase_saved_confirm")
              : methods?.has_phrase
                ? t("settings.recovery_phrase_regenerate_warning")
                : t("settings.recovery_phrase_row_desc")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {!generated_phrase ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  {t("settings.password")}
                </label>
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  maxLength={128}
                  placeholder={t("common.enter_password_prompt")}
                  type="password"
                  value={phrase_password}
                  onChange={(e) =>
                    set_phrase_password(clamp_password(e.target.value))
                  }
                  onKeyDown={(e) =>
                    e["key"] === "Enter" && handle_phrase_verify()
                  }
                />
              </div>
              {phrase_totp_required && (
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                    {t("settings.two_fa_code_label")}
                  </label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t("common.two_fa_code_placeholder")}
                    type="text"
                    value={phrase_totp_code}
                    onChange={(e) =>
                      set_phrase_totp_code(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    onKeyDown={(e) =>
                      e["key"] === "Enter" && handle_phrase_verify()
                    }
                  />
                </div>
              )}
              {phrase_error && (
                <p className="text-xs text-red-500">{phrase_error}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <div
                  className={
                    phrase_revealed
                      ? "grid grid-cols-3 gap-2"
                      : "grid grid-cols-3 gap-2 blur-sm select-none"
                  }
                >
                  {phrase_words.map((word, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-3 py-2 rounded-[14px] bg-surf-secondary border border-edge-primary"
                    >
                      <span className="text-[10px] font-medium w-4 text-txt-muted">
                        {index + 1}
                      </span>
                      <code className="text-xs font-mono text-txt-primary">
                        {word}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="md"
                  variant="outline"
                  onClick={() => set_phrase_revealed(!phrase_revealed)}
                >
                  {phrase_revealed ? (
                    <EyeSlashIcon className="w-3.5 h-3.5" />
                  ) : (
                    <EyeIcon className="w-3.5 h-3.5" />
                  )}
                </Button>
                <Button
                  size="md"
                  title={t("common.copy")}
                  variant="outline"
                  onClick={handle_copy_phrase}
                >
                  <ClipboardIcon className="w-3.5 h-3.5" />
                  {t("common.copy")}
                </Button>
                <Button
                  size="md"
                  title={t("common.download")}
                  variant="outline"
                  onClick={handle_download_phrase}
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  {t("common.download")}
                </Button>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  checked={phrase_saved_checked}
                  className="mt-0.5"
                  type="checkbox"
                  onChange={(e) => set_phrase_saved_checked(e.target.checked)}
                />
                <span className="text-xs text-txt-secondary">
                  {t("settings.recovery_phrase_saved_confirm")}
                </span>
              </label>
              {phrase_error && (
                <p className="text-xs text-red-500">{phrase_error}</p>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={close_phrase_modal}>
            {t("common.cancel")}
          </Button>
          {!generated_phrase ? (
            <Button
              disabled={
                phrase_busy ||
                !phrase_password.trim() ||
                (phrase_totp_required && phrase_totp_code.length !== 6)
              }
              variant="depth"
              onClick={handle_phrase_verify}
            >
              {phrase_busy ? <Spinner size="md" /> : t("common.continue")}
            </Button>
          ) : (
            <Button
              disabled={phrase_busy || !phrase_saved_checked}
              variant="depth"
              onClick={handle_phrase_confirm}
            >
              {phrase_busy ? <Spinner size="md" /> : t("common.confirm")}
            </Button>
          )}
        </ModalFooter>
      </Modal>

      <Modal
        is_open={show_resurrect_modal}
        on_close={close_resurrect_modal}
        size="md"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.recover_older_data_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.resurrection_old_password_prompt")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          {resurrect_done ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <ShieldCheckIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-600 dark:text-green-400">
                {t("settings.resurrection_success")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-txt-secondary">
                  {t("settings.resurrection_old_password")}
                </label>
                <Input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  maxLength={128}
                  placeholder={t("common.enter_password_prompt")}
                  type="password"
                  value={old_password}
                  onChange={(e) =>
                    set_old_password(clamp_password(e.target.value))
                  }
                  onKeyDown={(e) => e["key"] === "Enter" && handle_resurrect()}
                />
              </div>
              {resurrect_error && (
                <p className="text-xs text-red-500">{resurrect_error}</p>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {resurrect_done ? (
            <Button variant="depth" onClick={close_resurrect_modal}>
              {t("common.close")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close_resurrect_modal}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={resurrect_busy || !old_password.trim()}
                variant="depth"
                onClick={handle_resurrect}
              >
                {resurrect_busy ? (
                  <Spinner size="md" />
                ) : (
                  t("settings.recover_older_data_button")
                )}
              </Button>
            </>
          )}
        </ModalFooter>
      </Modal>
    </div>
  );
}
