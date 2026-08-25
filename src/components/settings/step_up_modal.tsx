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
import type { StepUpCredentials } from "@/services/api/step_up";

import { useState, useRef, useEffect, useCallback } from "react";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  derive_step_up_credentials,
  fetch_step_up_requirements,
} from "@/services/api/step_up";
import {
  list_hardware_keys,
  perform_step_up_webauthn_assertion,
} from "@/services/api/webauthn";
import { use_i18n } from "@/lib/i18n/context";
import { clamp_password } from "@/services/sanitize";
import { ignore_error } from "@/lib/ignore_error";
import { user_facing_error } from "@/utils/user_facing_error";

interface StepUpModalProps {
  is_open: boolean;
  on_close: () => void;
  on_confirm: (credentials: StepUpCredentials) => Promise<void>;
  title: string;
  description: string;
  confirm_label: string;
  destructive?: boolean;
}

export function StepUpModal({
  is_open,
  on_close,
  on_confirm,
  title,
  description,
  confirm_label,
  destructive = false,
}: StepUpModalProps) {
  const { t } = use_i18n();
  const [password, set_password] = useState("");
  const [code, set_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [totp_optional, set_totp_optional] = useState(false);
  const [has_hardware_keys, set_has_hardware_keys] = useState(false);
  const [show_password, set_show_password] = useState(false);
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const [keys_error, set_keys_error] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const submitting_ref = useRef(false);

  const load_hardware_keys = useCallback(() => {
    set_keys_error(false);

    return list_hardware_keys()
      .then((res) => {
        if (!res.data) {
          set_keys_error(true);

          return;
        }
        set_has_hardware_keys(res.data.keys.length > 0);
      })
      .catch((caught) => {
        set_keys_error(true);
        ignore_error("components/settings/step_up_modal:StepUpModal", caught);
      });
  }, []);

  useEffect(() => {
    if (!is_open) return;
    set_password("");
    set_code("");
    set_error("");
    set_show_password(false);
    set_totp_required(false);
    set_totp_optional(false);
    set_has_hardware_keys(false);
    set_keys_error(false);
    setTimeout(() => input_ref.current?.focus(), 100);

    fetch_step_up_requirements()
      .then((requirements) => {
        set_totp_required(requirements.totp_required);
      })
      .catch((caught) => {
        set_totp_optional(true);
        ignore_error("components/settings/step_up_modal:StepUpModal", caught);
      });

    void load_hardware_keys();
  }, [is_open, load_hardware_keys]);

  const can_submit =
    !!password && (!totp_required || code.length === 6) && !is_loading;

  const handle_confirm = async () => {
    if (!password || submitting_ref.current) return;
    if (totp_required && code.length !== 6) return;

    submitting_ref.current = true;
    set_is_loading(true);
    set_error("");

    try {
      const credentials = await derive_step_up_credentials(
        password,
        code.length === 6 ? code : undefined,
      );

      if (!totp_required && has_hardware_keys) {
        credentials.hardware_key_assertion =
          await perform_step_up_webauthn_assertion();
      }

      await on_confirm(credentials);
    } catch (err) {
      set_error(user_facing_error(err, t("common.step_up_error")));
    } finally {
      submitting_ref.current = false;
      set_is_loading(false);
    }
  };

  return (
    <Modal
      close_on_escape={!is_loading}
      close_on_overlay={!is_loading}
      is_open={is_open}
      on_close={on_close}
      show_close_button={!is_loading}
      size="md"
    >
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <label
              className="text-sm font-medium block mb-2 text-txt-primary"
              htmlFor="step-up-password"
            >
              {t("settings.password")}
            </label>
            <div className="relative">
              <Input
                ref={input_ref}
                autoComplete="current-password"
                className="w-full pe-10"
                disabled={is_loading}
                id="step-up-password"
                maxLength={128}
                placeholder={t("settings.enter_your_password_placeholder")}
                status={error ? "error" : "default"}
                type={show_password ? "text" : "password"}
                value={password}
                onChange={(e) => set_password(clamp_password(e.target.value))}
                onKeyDown={(e) =>
                  e["key"] === "Enter" && !totp_required && handle_confirm()
                }
              />
              <button
                className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted"
                type="button"
                onClick={() => set_show_password(!show_password)}
              >
                {show_password ? (
                  <EyeSlashIcon className="w-4 h-4" />
                ) : (
                  <EyeIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {(totp_required || totp_optional) && (
            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="step-up-code"
              >
                {t("settings.authenticator_code")}
              </label>
              <Input
                autoComplete="one-time-code"
                className="text-center text-2xl font-semibold tracking-[0.5em]"
                disabled={is_loading}
                id="step-up-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                status={error ? "error" : "default"}
                type="text"
                value={code}
                onChange={(e) =>
                  set_code(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                onKeyDown={(e) => e["key"] === "Enter" && handle_confirm()}
              />
            </div>
          )}

          {!totp_required && has_hardware_keys && (
            <p className="text-sm text-txt-tertiary">
              {t("common.step_up_security_key_hint")}
            </p>
          )}

          {keys_error && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-center text-txt-muted">
                {t("settings.failed_load_security_status")}
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void load_hardware_keys()}
              >
                {t("settings.try_again")}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-center text-red-500">{error}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_loading} variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!can_submit}
          variant={destructive ? "destructive" : "depth"}
          onClick={handle_confirm}
        >
          {confirm_label}
          {is_loading ? <Spinner className="ms-2" size="md" /> : null}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
