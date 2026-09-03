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
import { motion, AnimatePresence } from "framer-motion";
import {
  FingerPrintIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button, Badge } from "@aster/ui";

import {
  RecommendationBox,
  ActionRecommendedBadge,
} from "@/components/settings/security/recommendation_box";
import { StepUpModal } from "@/components/settings/step_up_modal";
import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { InfoPopover } from "@/components/ui/info_popover";
import { use_i18n } from "@/lib/i18n/context";
import { is_desktop } from "@/native/invoke_bridge";
import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { get_session_passphrase } from "@/contexts/auth/session_passphrase";
import {
  list_hardware_keys,
  remove_hardware_key,
  rename_hardware_key,
  type HardwareKeyInfo,
} from "@/services/api/webauthn";
import {
  register_platform_passkey,
  register_security_key,
  is_passkey_supported,
  is_platform_passkey_available,
} from "@/services/api/passkeys";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { is_composing } from "@/utils/ime";

function format_date(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(app_locale(), {
      timeZone: get_display_time_zone(),
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function key_display_type(key: HardwareKeyInfo): "passkey" | "security_key" {
  return key.is_passkey ? "passkey" : "security_key";
}

interface KeyRowProps {
  key_info: HardwareKeyInfo;
  on_delete_click: (key: HardwareKeyInfo) => void;
  on_rename: (id: string, name: string | null) => void;
  removing: boolean;
}

function KeyRow({
  key_info,
  on_delete_click,
  on_rename,
  removing,
}: KeyRowProps) {
  const { t } = use_i18n();
  const [editing, set_editing] = useState(false);
  const [draft, set_draft] = useState("");
  const [saving, set_saving] = useState(false);
  const display_type = key_display_type(key_info);

  const start_edit = () => {
    set_draft(key_info.name_encrypted ?? "");
    set_editing(true);
  };

  const cancel_edit = () => {
    set_editing(false);
    set_draft("");
  };

  const save_name = async () => {
    const trimmed = draft.trim() || null;

    set_saving(true);
    const resp = await rename_hardware_key(key_info.id, trimmed);

    set_saving(false);
    if (resp.error) {
      show_toast(resp.error, "error");
    } else {
      on_rename(key_info.id, trimmed);
      set_editing(false);
      show_toast(t("passkeys.rename_saved"), "success");
    }
  };

  return (
    <div className="py-3 border-b border-edge-secondary last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {display_type === "passkey" ? (
            <FingerPrintIcon className="w-5 h-5 text-primary flex-shrink-0" />
          ) : (
            <KeyIcon className="w-5 h-5 text-txt-muted flex-shrink-0" />
          )}
          <div className="min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  className="text-sm font-medium bg-surf-secondary border border-edge-secondary rounded px-2 py-0.5 text-txt-primary outline-none focus:ring-1 focus:ring-primary w-40"
                  maxLength={100}
                  type="text"
                  value={draft}
                  onChange={(e) => set_draft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !is_composing(e)) save_name();
                    if (e.key === "Escape") cancel_edit();
                  }}
                />
                <Button
                  disabled={saving}
                  size="sm"
                  variant="primary"
                  onClick={save_name}
                >
                  {saving ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t("common.save")
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={cancel_edit}>
                  {t("common.cancel")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-txt-primary truncate">
                  {key_info.name_encrypted ||
                    (display_type === "passkey"
                      ? t("passkeys.unnamed_passkey")
                      : t("passkeys.unnamed_security_key"))}
                </span>
                <Badge className="flex-shrink-0" color="gray">
                  {display_type === "passkey"
                    ? t("passkeys.passkey_badge")
                    : t("passkeys.security_key_badge")}
                </Badge>
              </div>
            )}
            {!editing && (
              <p className="text-xs text-txt-muted mt-0.5">
                {t("passkeys.registered")} {format_date(key_info.registered_at)}
                {key_info.last_used
                  ? ` · ${t("passkeys.last_used")} ${format_date(key_info.last_used)}`
                  : ` · ${t("passkeys.never_used")}`}
              </p>
            )}
          </div>
        </div>

        {!editing && (
          <div className="flex items-center gap-2 flex-shrink-0 ms-2">
            <Button size="sm" variant="outline" onClick={start_edit}>
              {t("passkeys.rename")}
            </Button>
            <Button
              disabled={removing}
              size="sm"
              variant="destructive"
              onClick={() => on_delete_click(key_info)}
            >
              {removing ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                t("common.delete")
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PasskeySection() {
  const { t } = use_i18n();
  const { current_account_id } = use_auth();
  const [keys, set_keys] = useState<HardwareKeyInfo[]>([]);
  const [loading, set_loading] = useState(true);
  const [load_error, set_load_error] = useState(false);
  const [removing_id, set_removing_id] = useState<string | null>(null);
  const [pending_delete, set_pending_delete] = useState<HardwareKeyInfo | null>(
    null,
  );
  const [step_up_key_id, set_step_up_key_id] = useState<string | null>(null);
  const [registering, set_registering] = useState<
    "passkey" | "security_key" | null
  >(null);
  const [platform_available, set_platform_available] = useState<boolean | null>(
    null,
  );
  const webauthn_supported = is_passkey_supported();

  const load_keys = useCallback(async () => {
    set_load_error(false);
    try {
      const resp = await list_hardware_keys();

      if (resp.data) {
        set_keys(resp.data.keys);
      } else {
        set_load_error(true);
      }
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_keys();
    is_platform_passkey_available().then(set_platform_available);
  }, [load_keys]);

  const handle_remove = useCallback(
    async (
      key_id: string,
      credentials?: { password_hash: string; totp_code?: string },
    ) => {
      set_pending_delete(null);
      set_removing_id(key_id);
      try {
        const resp = await remove_hardware_key(key_id, credentials);

        if (resp.data?.success) {
          set_keys((prev) => prev.filter((k) => k.id !== key_id));
          set_step_up_key_id(null);
          show_toast(t("passkeys.removed"), "success");

          return;
        }

        if (resp.server_code === "STEP_UP_REQUIRED") {
          set_step_up_key_id(key_id);

          return;
        }

        if (credentials) throw new Error(resp.error || t("errors.generic"));
        show_toast(resp.error || t("errors.generic"), "error");
      } finally {
        set_removing_id(null);
      }
    },
    [t],
  );

  const handle_rename = useCallback((key_id: string, name: string | null) => {
    set_keys((prev) =>
      prev.map((k) => (k.id === key_id ? { ...k, name_encrypted: name } : k)),
    );
  }, []);

  const handle_add_passkey = useCallback(async () => {
    set_registering("passkey");
    try {
      const passphrase = current_account_id
        ? await get_session_passphrase(current_account_id).catch(() => null)
        : null;
      const resp = await register_platform_passkey(
        null,
        passphrase ?? undefined,
      );

      if (resp.data?.success) {
        const is_native =
          (resp.data as any).is_platform_authenticator !== false;

        if (!is_native) {
          show_toast(t("passkeys.saved_to_password_manager"), "info");
        } else {
          show_toast(t("passkeys.register_success"), "success");
        }
        if (resp.data.other_sessions_revoked) {
          show_toast(t("passkeys.other_devices_signed_out"), "info");
        }
        await load_keys();
      } else if (resp.error === "no_platform_authenticator") {
        show_toast(t("passkeys.no_platform_authenticator"), "error");
      } else if (resp.error === "passkey_cancelled") {
        show_toast(t("passkeys.passkey_setup_cancelled"), "info");
      } else {
        show_toast(
          resp.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
    } finally {
      set_registering(null);
    }
  }, [current_account_id, load_keys, t]);

  const handle_add_security_key = useCallback(async () => {
    set_registering("security_key");
    try {
      const resp = await register_security_key(null);

      if (resp.data?.success) {
        show_toast(t("passkeys.register_success"), "success");
        if (resp.data.other_sessions_revoked) {
          show_toast(t("passkeys.other_devices_signed_out"), "info");
        }
        await load_keys();
      } else if (resp.error === "no_platform_authenticator") {
        show_toast(t("passkeys.no_platform_authenticator"), "error");
      } else if (resp.error === "passkey_cancelled") {
        show_toast(t("passkeys.security_key_not_found"), "info");
      } else {
        show_toast(
          resp.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
    } finally {
      set_registering(null);
    }
  }, [load_keys, t]);

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <FingerPrintIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("passkeys.section_title")}
          <InfoPopover
            description={`${t("passkeys.passkey_hint")} ${t("passkeys.security_key_hint")}`}
            title={t("passkeys.section_title")}
          />
          {webauthn_supported &&
            !loading &&
            !load_error &&
            keys.length === 0 && (
              <ActionRecommendedBadge
                tip={t("settings.no_passkeys_recommendation")}
              />
            )}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <p className="text-sm text-txt-muted mb-4">
        {t("passkeys.section_description")}
      </p>

      {!webauthn_supported && (
        <RecommendationBox>{t("passkeys.not_supported")}</RecommendationBox>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {load_error && keys.length === 0 ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="py-6 text-center"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              <p className="text-sm text-txt-muted mb-3">
                {t("settings.failed_load_security_status")}
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  set_loading(true);
                  void load_keys();
                }}
              >
                {t("settings.try_again")}
              </Button>
            </motion.div>
          ) : keys.length === 0 ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="py-6 text-center"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              <FingerPrintIcon className="w-8 h-8 text-txt-muted mx-auto mb-2" />
              <p className="text-sm text-txt-muted">
                {t("passkeys.no_passkeys")}
              </p>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              className="mb-4"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              {keys.map((key) => (
                <KeyRow
                  key={key.id}
                  key_info={key}
                  on_delete_click={set_pending_delete}
                  on_rename={handle_rename}
                  removing={removing_id === key.id}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {webauthn_supported && is_desktop() && (
        <p className="text-sm text-txt-muted mt-2">
          {t("settings.passkeys_desktop_note")}
        </p>
      )}

      {webauthn_supported && !is_desktop() && (
        <div className="flex items-center gap-2 mt-2">
          {platform_available !== false && (
            <Button
              disabled={registering !== null}
              size="sm"
              variant="outline"
              onClick={handle_add_passkey}
            >
              {registering === "passkey" ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin me-2" />
              ) : (
                <FingerPrintIcon className="w-4 h-4 me-2" />
              )}
              {registering === "passkey"
                ? t("passkeys.registering")
                : t("passkeys.add_passkey")}
            </Button>
          )}
          <Button
            disabled={registering !== null}
            size="sm"
            variant="outline"
            onClick={handle_add_security_key}
          >
            {registering === "security_key" ? (
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin me-2" />
            ) : (
              <PlusIcon className="w-4 h-4 me-2" />
            )}
            {registering === "security_key"
              ? t("passkeys.registering")
              : t("passkeys.add_security_key")}
          </Button>
        </div>
      )}

      <ConfirmModal
        hide_dont_ask
        confirm_text={t("common.delete")}
        confirm_variant="destructive"
        description={t(
          pending_delete && !pending_delete.is_passkey
            ? "passkeys.delete_security_key_description"
            : "passkeys.delete_passkey_description",
          {
            name:
              pending_delete?.name_encrypted ||
              (pending_delete && !pending_delete.is_passkey
                ? t("passkeys.unnamed_security_key")
                : t("passkeys.unnamed_passkey")),
          },
        )}
        dont_ask={false}
        on_cancel={() => set_pending_delete(null)}
        on_confirm={() => {
          if (pending_delete) handle_remove(pending_delete.id);
        }}
        on_dont_ask_change={() => {}}
        show={!!pending_delete}
        title={t(
          pending_delete && !pending_delete.is_passkey
            ? "passkeys.delete_security_key_title"
            : "passkeys.delete_passkey_title",
        )}
      />

      <StepUpModal
        destructive
        confirm_label={t("common.remove")}
        description={t("passkeys.remove_last_key_step_up_description")}
        is_open={!!step_up_key_id}
        on_close={() => set_step_up_key_id(null)}
        on_confirm={async (credentials) => {
          if (!step_up_key_id) return;
          await handle_remove(step_up_key_id, {
            password_hash: credentials.password_hash,
            ...(credentials.totp_code
              ? { totp_code: credentials.totp_code }
              : {}),
          });
        }}
        title={t("passkeys.remove_last_key_step_up_title")}
      />
    </div>
  );
}
