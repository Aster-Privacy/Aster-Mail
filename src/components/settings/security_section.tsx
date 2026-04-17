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
import { useState } from "react";
import { Button, Switch } from "@aster/ui";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";

import { TotpSetupModal } from "./totp_setup_modal";
import { TotpDisableModal } from "./totp_disable_modal";

import { KeyRotationModal } from "@/components/modals/key_rotation_modal";
import { DeleteAccountModal } from "@/components/modals/delete_account_modal";
import { ConnectionSection } from "@/components/settings/connection_section";
import { TwoFactorSection } from "@/components/settings/security/two_factor_section";
import { PasswordSection } from "@/components/settings/security/password_section";
import { SessionSection } from "@/components/settings/security/session_section";
import { use_security } from "@/components/settings/hooks/use_security";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SecuritySectionProps {
  on_account_deleted?: () => void;
}

export function SecuritySection({ on_account_deleted }: SecuritySectionProps) {
  const security = use_security();
  const { t } = use_i18n();
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const [show_delete_modal, set_show_delete_modal] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("mail.tracking_protection")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.block_external_content")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.block_external_content_description")}
            </p>
          </div>
          <Switch
            checked={preferences.block_external_content}
            onCheckedChange={() => {
              const new_value = !preferences.block_external_content;

              if (new_value) {
                const mode =
                  preferences.external_content_blocking_mode || "trackers";
                const block_images = mode === "images" || mode === "both";
                const block_trackers = mode === "trackers" || mode === "both";

                update_preferences({
                  block_external_content: true,
                  external_content_blocking_mode: mode,
                  block_remote_images: block_images,
                  block_remote_fonts: block_trackers,
                  block_remote_css: block_trackers,
                  block_tracking_pixels: block_trackers,
                  load_remote_images: block_images ? "never" : "always",
                });
              } else {
                update_preferences({
                  block_external_content: false,
                  block_remote_images: false,
                  block_remote_fonts: false,
                  block_remote_css: false,
                  block_tracking_pixels: false,
                  load_remote_images: "always",
                });
              }
            }}
          />
        </div>

        {preferences.block_external_content && (
          <div className="flex items-center justify-between py-4">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.blocking_mode")}
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.blocking_mode_description")}
              </p>
            </div>
            <Select
              value={preferences.external_content_blocking_mode || "trackers"}
              onValueChange={(v) => {
                const mode = v as "trackers" | "images" | "both";
                const block_images = mode === "images" || mode === "both";
                const block_trackers = mode === "trackers" || mode === "both";

                update_preferences({
                  external_content_blocking_mode: mode,
                  block_remote_images: block_images,
                  block_remote_fonts: block_trackers,
                  block_remote_css: block_trackers,
                  block_tracking_pixels: block_trackers,
                  load_remote_images: block_images ? "never" : "always",
                });
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trackers">
                  {t("settings.trackers_only")}
                </SelectItem>
                <SelectItem value="images">
                  {t("settings.images_only")}
                </SelectItem>
                <SelectItem value="both">
                  {t("settings.images_and_trackers")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.show_tracking_protection")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.show_tracking_protection_description")}
            </p>
          </div>
          <Switch
            checked={preferences.show_tracking_protection !== false}
            onCheckedChange={() =>
              update_preference(
                "show_tracking_protection",
                preferences.show_tracking_protection === false,
              )
            }
          />
        </div>
      </div>

      <TwoFactorSection
        external_link_warning_dismissed={
          security.preferences.external_link_warning_dismissed
        }
        forward_secrecy_enabled={security.preferences.forward_secrecy_enabled}
        key_age_hours={security.key_age_hours}
        key_fingerprint={security.key_fingerprint}
        key_history_limit={security.preferences.key_history_limit}
        key_rotation_hours={security.preferences.key_rotation_hours}
        login_alerts_enabled={security.login_alerts_enabled}
        on_external_link_toggle={() =>
          security.update_preference(
            "external_link_warning_dismissed",
            !security.preferences.external_link_warning_dismissed,
          )
        }
        on_forward_secrecy_toggle={security.handle_forward_secrecy_toggle}
        on_key_history_change={(limit) =>
          security.update_preference("key_history_limit", limit)
        }
        on_key_rotation_change={(hours) =>
          security.update_preference("key_rotation_hours", hours)
        }
        on_login_alerts_toggle={security.handle_login_alerts_toggle}
        on_rotate_keys_now={security.show_manual_rotation_modal}
        on_timeout_change={security.handle_timeout_change}
        on_timeout_toggle={security.handle_timeout_toggle}
        on_two_factor_toggle={security.handle_two_factor_toggle}
        session_timeout_enabled={security.preferences.session_timeout_enabled}
        session_timeout_minutes={security.preferences.session_timeout_minutes}
        timeout_description={security.get_timeout_description()}
        totp_backup_codes_remaining={
          security.totp_status?.backup_codes_remaining
        }
        totp_enabled={security.totp_status?.enabled ?? false}
      />

      <PasswordSection
        confirm_password={security.confirm_password}
        current_password={security.current_password}
        new_password={security.new_password}
        on_cancel={security.handle_password_cancel}
        on_change_password={security.handle_change_password}
        on_new_password_blur={security.handle_new_password_blur}
        password_breach_warning={security.password_breach_warning}
        password_error={security.password_error}
        password_loading={security.password_loading}
        password_success={security.password_success}
        set_confirm_password={security.set_confirm_password}
        set_current_password={security.set_current_password}
        set_new_password={security.set_new_password}
        set_show_current_password={security.set_show_current_password}
        set_show_new_password={security.set_show_new_password}
        set_show_password_section={security.set_show_password_section}
        show_current_password={security.show_current_password}
        show_new_password={security.show_new_password}
        show_password_section={security.show_password_section}
      />

      <SessionSection
        logout_others_loading={security.logout_others_loading}
        logout_others_result={security.logout_others_result}
        on_revoke_all_sessions={security.handle_revoke_all_sessions}
        on_revoke_session={security.handle_revoke_session}
        sessions={security.sessions}
        sessions_error={security.sessions_error}
        sessions_loading={security.sessions_loading}
      />

      <div className="flex items-center justify-between py-4 px-1 mt-4 border-t border-edge-secondary">
        <div>
          <p className="text-sm font-medium text-red-500">
            {t("common.delete_account")}
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("common.erase_all_data")}
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => set_show_delete_modal(true)}
        >
          {t("common.delete")}
        </Button>
      </div>

      <div className="pt-3">
        <ConnectionSection />
      </div>

      <TotpSetupModal
        is_open={security.show_totp_setup_modal}
        on_close={() => security.set_show_totp_setup_modal(false)}
        on_success={security.handle_totp_setup_success}
      />

      <TotpDisableModal
        is_open={security.show_totp_disable_modal}
        on_close={() => security.set_show_totp_disable_modal(false)}
        on_success={security.handle_totp_disable_success}
      />

      <KeyRotationModal
        is_manual
        is_open={security.show_rotation_modal}
        key_age_hours={security.key_age_hours}
        key_fingerprint={security.key_fingerprint}
        on_close={security.close_rotation_modal}
        on_rotate={security.perform_rotation}
      />

      <DeleteAccountModal
        is_open={show_delete_modal}
        on_close={() => set_show_delete_modal(false)}
        on_deleted={() => {
          set_show_delete_modal(false);
          on_account_deleted?.();
        }}
      />
    </div>
  );
}
