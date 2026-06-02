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
import { Button, Switch, UpgradeBtn } from "@aster/ui";

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
  clear_app_lock_config,
  clear_session_unlock,
} from "@/services/app_lock_store";
import { go_to_billing } from "@/components/settings/aliases/feature_lock";
import {
  enable_vanguard,
  disable_vanguard,
  get_vanguard_status,
} from "@/services/api/vanguard";

export function VanguardSection() {
  const { t } = use_i18n();
  const { limits, is_loading } = use_plan_limits();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";

  const is_nova_plus = ["nova", "supernova"].includes(
    limits?.plan_code ?? "",
  );

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
    set_enabled(false);
    set_vanguard_enabled(account_id, false);
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
                title={t("settings.vanguard_title")}
                description={t("settings.vanguard_info")}
              />
              {enabled && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-emerald-500 text-white border border-emerald-600">
                  {t("settings.vanguard_active")}
                </span>
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
          </div>
        )}
      </div>

      <Modal
        is_open={show_disable_confirm}
        on_close={() => set_show_disable_confirm(false)}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.vanguard_confirm_disable_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.vanguard_confirm_disable_desc")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody />
        <ModalFooter>
          <Button variant="outline" onClick={() => set_show_disable_confirm(false)}>
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
