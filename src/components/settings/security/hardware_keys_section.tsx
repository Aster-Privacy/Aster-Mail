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
import { KeyIcon, TrashIcon, PlusIcon, PencilIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { is_desktop } from "@/native/invoke_bridge";
import {
  list_hardware_keys,
  initiate_hardware_key_registration,
  perform_webauthn_registration,
  remove_hardware_key,
  rename_hardware_key,
  is_webauthn_supported,
  HardwareKeyInfo,
} from "@/services/api/webauthn";

export function HardwareKeysSection() {
  const { t } = use_i18n();
  const [keys, set_keys] = useState<HardwareKeyInfo[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_registering, set_is_registering] = useState(false);
  const [show_add_modal, set_show_add_modal] = useState(false);
  const [key_name, set_key_name] = useState("");
  const [removing_key_id, set_removing_key_id] = useState<string | null>(null);
  const [editing_key_id, set_editing_key_id] = useState<string | null>(null);
  const [rename_draft, set_rename_draft] = useState("");
  const [is_saving_rename, set_is_saving_rename] = useState(false);

  const fetch_keys = useCallback(async () => {
    set_is_loading(true);
    const response = await list_hardware_keys();

    if (response.data) {
      set_keys(response.data.keys);
    }
    set_is_loading(false);
  }, []);

  useEffect(() => {
    fetch_keys();
  }, [fetch_keys]);

  const handle_register = async () => {
    if (!webauthn_supported) {
      show_toast(t("auth.webauthn_not_supported"), "error");

      return;
    }

    set_is_registering(true);

    const options_response = await initiate_hardware_key_registration();

    if (options_response.error || !options_response.data) {
      show_toast(
        options_response.error || t("common.something_went_wrong"),
        "error",
      );
      set_is_registering(false);

      return;
    }

    let result;

    try {
      result = await perform_webauthn_registration(
        options_response.data,
        key_name || null,
      );
    } catch {
      show_toast(t("common.something_went_wrong"), "error");
      set_is_registering(false);

      return;
    }

    if (result.error) {
      show_toast(result.error, "error");
      set_is_registering(false);

      return;
    }

    show_toast(t("settings.security_key_registered"), "success");
    set_is_registering(false);
    set_show_add_modal(false);
    set_key_name("");
    fetch_keys();
  };

  const handle_remove = async (key_id: string) => {
    set_removing_key_id(key_id);
    const response = await remove_hardware_key(key_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.security_key_removed"), "success");
      set_keys((prev) => prev.filter((k) => k.id !== key_id));
    }
    set_removing_key_id(null);
  };

  const start_rename = (key: HardwareKeyInfo) => {
    set_rename_draft(key.name_encrypted ?? "");
    set_editing_key_id(key.id);
  };

  const cancel_rename = () => {
    set_editing_key_id(null);
    set_rename_draft("");
  };

  const save_rename = async (key_id: string) => {
    const trimmed = rename_draft.trim() || null;
    set_is_saving_rename(true);
    const resp = await rename_hardware_key(key_id, trimmed);
    set_is_saving_rename(false);
    if (resp.error) {
      show_toast(resp.error, "error");
    } else {
      set_keys((prev) =>
        prev.map((k) => (k.id === key_id ? { ...k, name_encrypted: trimmed } : k)),
      );
      set_editing_key_id(null);
      show_toast(t("passkeys.rename_saved"), "success");
    }
  };

  const handle_close_modal = () => {
    if (!is_registering) {
      set_show_add_modal(false);
      set_key_name("");
    }
  };

  const format_date = (date_str: string) => {
    return new Date(date_str).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const webauthn_supported = is_webauthn_supported();

  return (
    <>
      <div className="py-4 px-1">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.security_keys")}
            </p>
            <p className="text-xs mt-0.5 text-txt-muted">
              {t("settings.security_keys_description")}
            </p>
          </div>
          {webauthn_supported && !is_desktop() && (
            <Button
              disabled={is_registering}
              variant="secondary"
              onClick={() => set_show_add_modal(true)}
            >
              <PlusIcon className="w-4 h-4 mr-1.5" />
              {t("settings.add_security_key")}
            </Button>
          )}
        </div>

        {is_desktop() && (
          <p className="text-xs mb-3 text-txt-muted">
            {t("settings.security_keys_desktop_note")}
          </p>
        )}

        {is_loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 rounded-full animate-spin border-edge-secondary border-t-brand" />
          </div>
        ) : (
          <div className="space-y-2">
            {keys.length === 0 && (
              <p className="text-sm text-txt-muted py-2">
                {t("settings.no_security_keys")}
              </p>
            )}

            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-3 rounded-lg bg-surf-secondary"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <KeyIcon className="w-5 h-5 text-txt-muted flex-shrink-0" />
                  <div className="min-w-0">
                    {editing_key_id === key.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          className="text-sm font-medium bg-surf-primary border border-edge-secondary rounded px-2 py-0.5 text-txt-primary outline-none focus:ring-1 focus:ring-primary w-40"
                          maxLength={100}
                          type="text"
                          value={rename_draft}
                          onChange={(e) => set_rename_draft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") save_rename(key.id);
                            if (e.key === "Escape") cancel_rename();
                          }}
                        />
                        <button
                          className="text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
                          disabled={is_saving_rename}
                          type="button"
                          onClick={() => save_rename(key.id)}
                        >
                          {is_saving_rename ? (
                            <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            t("common.save")
                          )}
                        </button>
                        <button
                          className="text-xs text-txt-muted hover:text-txt-primary transition-colors"
                          type="button"
                          onClick={cancel_rename}
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-txt-primary">
                        {key.name_encrypted || key.type}
                      </p>
                    )}
                    {editing_key_id !== key.id && (
                      <p className="text-xs text-txt-muted">
                        {t("settings.registered")}:{" "}
                        {format_date(key.registered_at)}
                        {key.last_used
                          ? ` · ${t("settings.last_used")}: ${format_date(key.last_used)}`
                          : ` · ${t("settings.never_used")}`}
                      </p>
                    )}
                  </div>
                </div>
                {editing_key_id !== key.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      className="p-1.5 rounded-[14px] transition-colors hover:bg-surf-tertiary"
                      title={t("passkeys.rename")}
                      type="button"
                      onClick={() => start_rename(key)}
                    >
                      <PencilIcon className="w-4 h-4 text-txt-muted" />
                    </button>
                    <button
                      className="p-1.5 rounded-[14px] transition-colors hover:bg-surf-tertiary"
                      disabled={removing_key_id === key.id}
                      type="button"
                      onClick={() => {
                        if (window.confirm(t("settings.confirm_remove_key"))) {
                          handle_remove(key.id);
                        }
                      }}
                    >
                      <TrashIcon className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {!webauthn_supported && (
              <p className="text-sm text-txt-muted py-2">
                {t("auth.webauthn_not_supported")}
              </p>
            )}
          </div>
        )}
      </div>

      <Modal
        close_on_overlay={!is_registering}
        is_open={show_add_modal}
        on_close={handle_close_modal}
        show_close_button={!is_registering}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.add_security_key")}</ModalTitle>
          <ModalDescription>{t("settings.name_your_key")}</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <Input
            placeholder={t("settings.key_name_placeholder")}
            type="text"
            value={key_name}
            onChange={(e) => set_key_name(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !is_registering) handle_register();
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button
            disabled={is_registering}
            variant="outline"
            onClick={handle_close_modal}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={is_registering}
            variant="depth"
            onClick={handle_register}
          >
            {is_registering ? t("common.loading") : t("common.continue")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
