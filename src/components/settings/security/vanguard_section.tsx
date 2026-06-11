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
import { Badge, Button, Switch, UpgradeBtn } from "@aster/ui";

import { InfoPopover } from "@/components/ui/info_popover";
import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { use_auth_safe } from "@/contexts/auth_context";
import { AppLockSection } from "@/components/settings/security/app_lock_section";
import {
  is_vanguard_enabled,
  set_vanguard_enabled,
  init_vanguard_from_server,
} from "@/services/vanguard_store";
import {
  is_lockdown_enabled,
  set_lockdown_enabled,
  init_lockdown_from_server,
} from "@/services/lockdown_store";
import {
  clear_app_lock_config,
  clear_session_unlock,
} from "@/services/app_lock_store";
import { go_to_billing } from "@/components/settings/aliases/feature_lock";
import {
  enable_vanguard,
  disable_vanguard,
  get_vanguard_status,
} from "@/services/api/vanguard";
import {
  enable_lockdown,
  disable_lockdown,
} from "@/services/api/lockdown";
import { get_user_salt } from "@/services/api/auth";
import { hash_email, derive_password_hash } from "@/services/crypto/key_manager_pgp";
import { base64_to_array } from "@/services/crypto/key_manager";
import { get_totp_status } from "@/services/api/totp";

function LockdownSection({ account_id }: { account_id: string }) {
  const { t } = use_i18n();
  const auth = use_auth_safe();

  const [enabled, set_enabled] = useState(false);
  const [show_disable_modal, set_show_disable_modal] = useState(false);
  const [password, set_password] = useState("");
  const [totp_code, set_totp_code] = useState("");
  const [totp_required, set_totp_required] = useState(false);
  const [creds_error, set_creds_error] = useState<string | null>(null);
  const [disabling, set_disabling] = useState(false);

  useEffect(() => {
    if (!account_id) return;
    set_enabled(is_lockdown_enabled(account_id));
    init_lockdown_from_server(account_id).then(set_enabled);
  }, [account_id]);

  const handle_toggle = (checked: boolean) => {
    if (checked) {
      enable_lockdown().then((res) => {
        if (res.error) {
          show_toast(res.error, "error");
        } else {
          set_lockdown_enabled(account_id, true);
          set_enabled(true);
          show_toast(t("settings.lockdown_enabled_toast"), "success");
        }
      });
    } else {
      get_totp_status().then((res) => {
        set_totp_required(res.data?.enabled ?? false);
      });
      set_show_disable_modal(true);
    }
  };

  const confirm_disable = async () => {
    set_disabling(true);
    set_creds_error(null);
    try {
      const email = auth?.user?.email;
      if (!email) throw new Error("no_email");
      const user_hash = await hash_email(email);
      const salt_res = await get_user_salt({ user_hash });
      if (salt_res.error || !salt_res.data) throw new Error("salt");
      const salt = base64_to_array(salt_res.data.salt);
      const { hash: password_hash } = await derive_password_hash(password, salt);
      const res = await disable_lockdown({ password_hash, totp_code: totp_required ? totp_code : undefined });
      if (res.error) {
        set_creds_error(t("settings.duress_pin_invalid_credentials"));
        set_disabling(false);
        return;
      }
      set_lockdown_enabled(account_id, false);
      set_enabled(false);
      set_show_disable_modal(false);
      set_password("");
      set_totp_code("");
      show_toast(t("settings.lockdown_disabled_toast"), "success");
    } catch {
      set_creds_error(t("settings.duress_pin_invalid_credentials"));
    }
    set_disabling(false);
  };

  return (
    <>
      <div className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.lockdown_enable")}
              </p>
              <InfoPopover
                description={t("settings.lockdown_info")}
                title={t("settings.lockdown_title")}
              />
              {enabled && (
                <Badge color="red">{t("settings.lockdown_active")}</Badge>
              )}
            </div>
            <p className="text-xs mt-0.5 text-txt-muted">
              {t("settings.lockdown_description")}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={handle_toggle} />
        </div>
      </div>

      <Modal
        is_open={show_disable_modal}
        on_close={() => {
          set_show_disable_modal(false);
          set_password("");
          set_totp_code("");
          set_creds_error(null);
        }}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.lockdown_confirm_disable_title")}</ModalTitle>
          <ModalDescription>{t("settings.lockdown_confirm_disable_desc")}</ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-3">
            <div>
              <input
                type="password"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder={t("settings.current_password")}
                value={password}
                onChange={(e) => set_password(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {totp_required && (
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  placeholder={t("common.two_fa_code_placeholder")}
                  value={totp_code}
                  onChange={(e) => set_totp_code(e.target.value)}
                  autoComplete="one-time-code"
                  maxLength={6}
                />
              </div>
            )}
            {creds_error && (
              <p className="text-xs text-red-500">{creds_error}</p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              set_show_disable_modal(false);
              set_password("");
              set_totp_code("");
              set_creds_error(null);
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={confirm_disable}
            disabled={disabling || !password}
          >
            {t("settings.lockdown_disable")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export function VanguardSection() {
  const { t } = use_i18n();
  const { limits, is_loading } = use_plan_limits();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";

  const is_nova_plus = ["nova", "supernova", "duo", "family"].includes(limits?.plan_code ?? "");

  const [enabled, set_enabled] = useState(false);
  const [show_disable_confirm, set_show_disable_confirm] = useState(false);

  useEffect(() => {
    if (!account_id) return;
    set_enabled(is_vanguard_enabled(account_id));
    init_vanguard_from_server(account_id).then((server_enabled) => {
      set_enabled(server_enabled);
    });
  }, [account_id]);

  useEffect(() => {
    if (!is_loading && !is_nova_plus && enabled && account_id) {
      set_vanguard_enabled(account_id, false);
      set_lockdown_enabled(account_id, false);
      clear_app_lock_config(account_id);
      clear_session_unlock(account_id);
      set_enabled(false);
    }
  }, [is_loading, is_nova_plus, enabled, account_id]);

  const handle_toggle = (checked: boolean) => {
    if (checked) {
      set_enabled(true);
      set_vanguard_enabled(account_id, true);
      enable_vanguard().then((res) => {
        if (res.error) {
          set_enabled(false);
          set_vanguard_enabled(account_id, false);
          show_toast(res.error, "error");
        } else {
          show_toast(t("settings.vanguard_enabled_toast"), "success");
        }
      });
    } else {
      set_show_disable_confirm(true);
    }
  };

  const confirm_disable = () => {
    if (is_lockdown_enabled(account_id)) {
      set_show_disable_confirm(false);
      show_toast(t("settings.lockdown_must_disable_first"), "error");
      return;
    }
    set_enabled(false);
    set_vanguard_enabled(account_id, false);
    set_lockdown_enabled(account_id, false);
    clear_app_lock_config(account_id);
    clear_session_unlock(account_id);
    set_show_disable_confirm(false);
    disable_vanguard().then((res) => {
      if (res.error) {
        get_vanguard_status().then((status) => {
          if (status.data) {
            set_enabled(status.data.enabled);
            set_vanguard_enabled(account_id, status.data.enabled);
          }
        });
        show_toast(res.error, "error");
      } else {
        show_toast(t("settings.vanguard_disabled_toast"), "success");
      }
    });
  };

  if (is_loading) {
    return <div className="h-14 rounded-xl bg-muted/50 animate-pulse mx-1" />;
  }

  return (
    <>
      <div className="py-4 px-1">
        <div className="flex items-center justify-between">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.vanguard_enable")}
              </p>
              <InfoPopover
                description={t("settings.vanguard_info")}
                title={t("settings.vanguard_title")}
              />
              {enabled && (
                <Badge color="green">{t("settings.vanguard_active")}</Badge>
              )}
            </div>
            <p className="text-xs mt-0.5 text-txt-muted">
              {t("settings.vanguard_description")}
            </p>
          </div>

          {is_nova_plus ? (
            <Switch checked={enabled} onCheckedChange={handle_toggle} />
          ) : (
            <UpgradeBtn size="sm" onClick={go_to_billing}>
              {t("settings.vanguard_upgrade_cta")}
            </UpgradeBtn>
          )}
        </div>

        {enabled && (
          <div className="mt-4 border-l-2 border-primary/25 pl-4 space-y-0">
            <AppLockSection />
            <LockdownSection account_id={account_id} />
          </div>
        )}
      </div>

      <Modal
        is_open={show_disable_confirm}
        on_close={() => set_show_disable_confirm(false)}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>
            {t("settings.vanguard_confirm_disable_title")}
          </ModalTitle>
          <ModalDescription>
            {t("settings.vanguard_confirm_disable_desc")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody />
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => set_show_disable_confirm(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm_disable}>
            {t("settings.vanguard_disable")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
