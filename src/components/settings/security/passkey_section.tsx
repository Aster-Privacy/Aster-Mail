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
  TrashIcon,
  PlusIcon,
  PencilIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { is_desktop } from "@/native/invoke_bridge";
import { show_toast } from "@/components/toast/simple_toast";
import { cn } from "@/lib/utils";
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

function format_date(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
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
  on_remove: (id: string) => void;
  on_rename: (id: string, name: string | null) => void;
  removing: boolean;
}

function KeyRow({ key_info, on_remove, on_rename, removing }: KeyRowProps) {
  const { t } = use_i18n();
  const [confirm, set_confirm] = useState(false);
  const [editing, set_editing] = useState(false);
  const [draft, set_draft] = useState("");
  const [saving, set_saving] = useState(false);
  const display_type = key_display_type(key_info);

  const start_edit = () => {
    set_draft(key_info.name_encrypted ?? "");
    set_editing(true);
    set_confirm(false);
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
                    if (e.key === "Enter") save_name();
                    if (e.key === "Escape") cancel_edit();
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={save_name}
                >
                  {saving ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t("common.save")
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancel_edit}
                >
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
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0",
                    display_type === "passkey"
                      ? "bg-primary/10 text-primary"
                      : "bg-surf-secondary text-txt-muted border border-edge-secondary",
                  )}
                >
                  {display_type === "passkey"
                    ? t("passkeys.passkey_badge")
                    : t("passkeys.security_key_badge")}
                </span>
              </div>
            )}
            {!editing && (
              <p className="text-xs text-txt-muted mt-0.5">
                {t("passkeys.registered")}{" "}
                {format_date(key_info.registered_at)}
                {key_info.last_used
                  ? ` · ${t("passkeys.last_used")} ${format_date(key_info.last_used)}`
                  : ` · ${t("passkeys.never_used")}`}
              </p>
            )}
          </div>
        </div>

        {!editing && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <button
              className="p-1.5 rounded-md text-txt-muted hover:text-txt-primary hover:bg-surf-tertiary transition-colors"
              title={t("passkeys.rename")}
              onClick={start_edit}
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            {confirm ? (
              <div className="flex items-center gap-2 ml-1">
                <button
                  className="text-xs text-txt-muted hover:text-txt-primary transition-colors"
                  onClick={() => set_confirm(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                  disabled={removing}
                  onClick={() => on_remove(key_info.id)}
                >
                  {removing ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    t("passkeys.confirm_remove")
                  )}
                </button>
              </div>
            ) : (
              <button
                className="p-1.5 rounded-md text-txt-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                onClick={() => set_confirm(true)}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
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
  const [removing_id, set_removing_id] = useState<string | null>(null);
  const [registering, set_registering] = useState<
    "passkey" | "security_key" | null
  >(null);
  const [_platform_available, set_platform_available] = useState(false);
  const webauthn_supported = is_passkey_supported();

  const load_keys = useCallback(async () => {
    try {
      const resp = await list_hardware_keys();
      if (resp.data) {
        set_keys(resp.data.keys);
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
    async (key_id: string) => {
      set_removing_id(key_id);
      try {
        const resp = await remove_hardware_key(key_id);
        if (resp.data?.success) {
          set_keys((prev) => prev.filter((k) => k.id !== key_id));
          show_toast(t("passkeys.removed"), "success");
        } else {
          show_toast(resp.error || t("errors.generic"), "error");
        }
      } finally {
        set_removing_id(null);
      }
    },
    [t],
  );

  const handle_rename = useCallback(
    (key_id: string, name: string | null) => {
      set_keys((prev) =>
        prev.map((k) => (k.id === key_id ? { ...k, name_encrypted: name } : k)),
      );
    },
    [],
  );

  const handle_add_passkey = useCallback(async () => {
    set_registering("passkey");
    try {
      const passphrase = current_account_id
        ? await get_session_passphrase(current_account_id).catch(() => null)
        : null;
      const resp = await register_platform_passkey(null, passphrase ?? undefined);
      if (resp.data?.success) {
        const is_native = (resp.data as any).is_platform_authenticator !== false;
        if (!is_native) {
          show_toast(t("passkeys.saved_to_password_manager"), "info");
        } else {
          show_toast(t("passkeys.register_success"), "success");
        }
        await load_keys();
      } else if (resp.error === "no_platform_authenticator") {
        show_toast(t("passkeys.no_platform_authenticator"), "error");
      } else if (resp.error === "passkey_cancelled") {
        show_toast(t("passkeys.passkey_setup_cancelled"), "info");
      } else if (resp.error) {
        show_toast(resp.error, "error");
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
        await load_keys();
      } else if (resp.error === "no_platform_authenticator") {
        show_toast(t("passkeys.no_platform_authenticator"), "error");
      } else if (resp.error === "passkey_cancelled") {
        show_toast(t("passkeys.security_key_not_found"), "info");
      } else if (resp.error) {
        show_toast(resp.error, "error");
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
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      <p className="text-sm text-txt-muted mb-4">
        {t("passkeys.section_description")}
      </p>

      {!webauthn_supported && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-4">
          <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t("passkeys.not_supported")}
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          {keys.length === 0 ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="py-6 text-center"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
            >
              <FingerPrintIcon className="w-8 h-8 text-txt-muted mx-auto mb-2" />
              <p className="text-sm text-txt-muted">{t("passkeys.no_passkeys")}</p>
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
                  on_remove={handle_remove}
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
        <div className="space-y-3 mt-2">
          <div>
            <Button
              disabled={registering !== null}
              size="sm"
              variant="outline"
              onClick={handle_add_passkey}
            >
              {registering === "passkey" ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <FingerPrintIcon className="w-4 h-4 mr-2" />
              )}
              {registering === "passkey"
                ? t("passkeys.registering")
                : t("passkeys.add_passkey")}
            </Button>
            <p className="text-xs text-txt-muted mt-1">
              {t("passkeys.passkey_hint")}
            </p>
          </div>
          <div>
            <Button
              disabled={registering !== null}
              size="sm"
              variant="outline"
              onClick={handle_add_security_key}
            >
              {registering === "security_key" ? (
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <PlusIcon className="w-4 h-4 mr-2" />
              )}
              {registering === "security_key"
                ? t("passkeys.registering")
                : t("passkeys.add_security_key")}
            </Button>
            <p className="text-xs text-txt-muted mt-1">
              {t("passkeys.security_key_hint")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
