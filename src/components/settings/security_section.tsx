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
import type { ApiResponse } from "@/services/api/client";
import type { HardwareKeysListResponse } from "@/services/api/webauthn";

import { useState } from "react";
import { Badge, Button, Switch } from "@aster/ui";
import {
  ShieldCheckIcon,
  PhotoIcon,
  CodeBracketIcon,
  CpuChipIcon,
} from "@heroicons/react/24/outline";

import { TotpDisableModal } from "./totp_disable_modal";
import { RegenerateBackupCodesModal } from "./regenerate_backup_codes_modal";

import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { use_settings_panel_data } from "@/components/settings/hooks/use_settings_prefetch";
import { InfoPopover } from "@/components/ui/info_popover";
import { KeyRotationModal } from "@/components/modals/key_rotation_modal";
import { DeleteAccountModal } from "@/components/modals/delete_account_modal";
import { ConnectionSection } from "@/components/settings/connection_section";
import { PasskeySection } from "@/components/settings/security/passkey_section";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  LoginAlertsSessionsGroup,
  ExternalLinkWarningsGroup,
  ForwardSecrecyGroup,
} from "@/components/settings/security/two_factor_section";
import { BasicsSection } from "@/components/settings/security/basics_section";
import { VanguardSection } from "@/components/settings/security/vanguard_section";
import { SessionSection } from "@/components/settings/security/session_section";
import { TrustedDevicesSection } from "@/components/settings/security/trusted_devices_section";
import { RecoverOlderDataSection } from "@/components/settings/security/recover_older_data_section";
import { AccountRecoverySection } from "@/components/settings/security/account_recovery_section";
import { AccountProtectionScore } from "@/components/settings/security/account_protection_score";
import { use_security } from "@/components/settings/hooks/use_security";
import { show_toast } from "@/components/toast/simple_toast";
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
  show_inline_totp_setup?: boolean;
  set_show_inline_totp_setup?: (
    value: boolean | ((prev: boolean) => boolean),
  ) => void;
}

function find_scroll_container(el: HTMLElement): HTMLElement | null {
  let container: HTMLElement | null = el.parentElement;

  while (container && container !== document.body) {
    const { overflowY } = window.getComputedStyle(container);

    if (overflowY === "auto" || overflowY === "scroll") {
      return container;
    }

    container = container.parentElement;
  }

  return null;
}

function scroll_to_id(id: string) {
  const run = () => {
    const el = document.getElementById(id);

    if (!el) return;

    const container = find_scroll_container(el);

    if (!container) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });

      return;
    }

    const target =
      container.scrollTop +
      (el.getBoundingClientRect().top - container.getBoundingClientRect().top) -
      24;
    const max_top = container.scrollHeight - container.clientHeight;
    const clamped = Math.max(0, Math.min(target, max_top));

    container.scrollTo({ top: clamped, behavior: "smooth" });
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}

export function SecuritySection({
  on_account_deleted,
  show_inline_totp_setup: show_inline_totp_setup_prop,
  set_show_inline_totp_setup: set_show_inline_totp_setup_prop,
}: SecuritySectionProps) {
  const security = use_security();
  const { t } = use_i18n();
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const [show_delete_modal, set_show_delete_modal] = useState(false);
  const [show_regenerate_modal, set_show_regenerate_modal] = useState(false);
  const [pending_disable, set_pending_disable] = useState<
    "forward_secrecy" | "login_alerts" | null
  >(null);
  const [show_inline_totp_setup_local, set_show_inline_totp_setup_local] =
    useState(false);
  const show_inline_totp_setup =
    show_inline_totp_setup_prop ?? show_inline_totp_setup_local;
  const set_show_inline_totp_setup =
    set_show_inline_totp_setup_prop ?? set_show_inline_totp_setup_local;
  const {
    data: passkey_data,
    error: passkey_error,
    is_loading: passkey_is_loading,
    revalidate: revalidate_passkeys,
  } = use_settings_panel_data<ApiResponse<HardwareKeysListResponse>>(
    "passkey_list",
  );
  const passkey_registered = (passkey_data?.data?.keys?.length ?? 0) > 0;
  const passkey_loaded = !passkey_is_loading;

  const confirm_disable_copy = {
    forward_secrecy: {
      title: t("settings.forward_secrecy_disable_title"),
      message: t("settings.forward_secrecy_disable_message"),
    },
    login_alerts: {
      title: t("settings.login_alerts_disable_title"),
      message: t("settings.login_alerts_disable_message"),
    },
  };

  const handle_confirmed_disable = () => {
    const target = pending_disable;

    set_pending_disable(null);
    if (target === "forward_secrecy")
      void security.handle_forward_secrecy_toggle();
    if (target === "login_alerts") void security.handle_login_alerts_toggle();
  };

  const on_forward_secrecy_toggle = () => {
    if (preferences.forward_secrecy_enabled) {
      set_pending_disable("forward_secrecy");

      return;
    }
    void security.handle_forward_secrecy_toggle();
  };

  const on_login_alerts_toggle = () => {
    if (security.login_alerts_enabled) {
      set_pending_disable("login_alerts");

      return;
    }
    void security.handle_login_alerts_toggle();
  };

  const on_two_factor_toggle = () => {
    if (!security.totp_status) {
      show_toast(t("settings.failed_load_security_status"), "error");
      void security.fetch_totp_status();

      return;
    }
    if (security.totp_status.enabled) {
      security.set_show_totp_disable_modal(true);
    } else {
      set_show_inline_totp_setup((prev) => !prev);
    }
  };

  return (
    <div className="space-y-4">
      {passkey_error && (
        <LoadFailedNotice on_retry={() => void revalidate_passkeys()} />
      )}
      {!passkey_error && (
        <AccountProtectionScore
          block_remote_images={preferences.block_remote_images}
          block_tracking_pixels={preferences.block_tracking_pixels}
          login_alerts_enabled={security.login_alerts_enabled}
          on_criterion_click={[
            () => scroll_to_id("sec-2fa"),
            () => scroll_to_id("sec-passkeys"),
            () =>
              window.dispatchEvent(
                new CustomEvent("navigate-settings", { detail: "account" }),
              ),
            () => scroll_to_id("sec-2fa"),
            () => scroll_to_id("sec-tracking"),
            () => scroll_to_id("sec-images"),
            () => scroll_to_id("sec-images"),
          ]}
          passkey_registered={passkey_registered}
          recovery_email_verified={security.recovery_email_verified}
          security_loaded={
            security.security_score_loaded &&
            passkey_loaded &&
            !security.totp_status_failed
          }
          strip_exif_on_compose={preferences.strip_exif_on_compose}
          totp_enabled={security.totp_status?.enabled ?? false}
        />
      )}

      <div id="sec-2fa">
        <BasicsSection
          on_inline_totp_setup_success={() => {
            set_show_inline_totp_setup(false);
            security.handle_totp_setup_success();
          }}
          on_regenerate_backup_codes={() => set_show_regenerate_modal(true)}
          on_totp_status_retry={() => void security.fetch_totp_status()}
          on_two_factor_toggle={on_two_factor_toggle}
          password_props={{
            confirm_password: security.confirm_password,
            current_password: security.current_password,
            last_password_change: security.last_password_change,
            password_strength_tier: security.password_strength_tier,
            new_password: security.new_password,
            on_cancel: security.handle_password_cancel,
            on_change_password: security.handle_change_password,
            on_new_password_blur: security.handle_new_password_blur,
            password_breach_warning: security.password_breach_warning,
            password_error: security.password_error,
            password_loading: security.password_loading,
            password_success: security.password_success,
            password_unreadable_notice: security.password_unreadable_notice,
            set_confirm_password: security.set_confirm_password,
            set_current_password: security.set_current_password,
            set_new_password: security.set_new_password,
            set_show_current_password: security.set_show_current_password,
            set_show_new_password: security.set_show_new_password,
            set_show_password_section: security.set_show_password_section,
            show_current_password: security.show_current_password,
            show_new_password: security.show_new_password,
            show_password_section: security.show_password_section,
          }}
          show_inline_totp_setup={show_inline_totp_setup}
          totp_backup_codes_remaining={
            security.totp_status?.backup_codes_remaining
          }
          totp_enabled={security.totp_status?.enabled ?? false}
          totp_status_failed={security.totp_status_failed}
        />
      </div>

      <div id="sec-passkeys">
        <PasskeySection />
      </div>

      <SessionSection
        logout_others_loading={security.logout_others_loading}
        logout_others_result={security.logout_others_result}
        on_revoke_all_sessions={security.handle_revoke_all_sessions}
        on_revoke_session={security.handle_revoke_session}
        sessions={security.sessions}
        sessions_error={security.sessions_error}
        sessions_loading={security.sessions_loading}
      />

      <TrustedDevicesSection />

      <LoginAlertsSessionsGroup
        login_alerts_enabled={security.login_alerts_enabled}
        login_alerts_failed={security.login_alerts_failed}
        login_alerts_loaded={security.login_alerts_loaded}
        login_events={security.login_events}
        login_events_failed={security.login_events_failed}
        login_events_loading={security.login_events_loading}
        on_login_alerts_toggle={on_login_alerts_toggle}
        on_reload_login_alerts={() => void security.fetch_login_alerts_status()}
        on_reload_login_events={security.fetch_login_events}
        on_timeout_change={security.handle_timeout_change}
        on_timeout_toggle={security.handle_timeout_toggle}
        session_timeout_enabled={security.preferences.session_timeout_enabled}
        session_timeout_minutes={security.preferences.session_timeout_minutes}
        timeout_description={security.get_timeout_description()}
      />

      <ExternalLinkWarningsGroup
        external_link_warning_dismissed={
          security.preferences.external_link_warning_dismissed
        }
        on_external_link_toggle={() =>
          security.update_preference(
            "external_link_warning_dismissed",
            !security.preferences.external_link_warning_dismissed,
            true,
          )
        }
      />

      <ForwardSecrecyGroup
        forward_secrecy_enabled={security.preferences.forward_secrecy_enabled}
        forward_secrecy_working={security.forward_secrecy_working}
        key_age_hours={security.key_age_hours}
        key_fingerprint={security.key_fingerprint}
        key_history_limit={security.preferences.key_history_limit}
        key_rotation_hours={security.preferences.key_rotation_hours}
        on_forward_secrecy_toggle={on_forward_secrecy_toggle}
        on_key_history_change={(limit) =>
          security.update_preference("key_history_limit", limit, true)
        }
        on_key_rotation_change={(hours) =>
          security.update_preference("key_rotation_hours", hours, true)
        }
        on_rotate_keys_now={security.show_manual_rotation_modal}
      />

      <AccountRecoverySection />

      <RecoverOlderDataSection />

      <div id="sec-tracking">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.tracking_protection_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.tracking_protection_enabled")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.tracking_protection_enabled_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.tracking_protection_enabled")}
            checked={preferences.block_external_content}
            size="lg"
            onCheckedChange={() => {
              const new_value = !preferences.block_external_content;

              if (new_value) {
                update_preferences(
                  {
                    block_external_content: true,
                    block_tracking_pixels: true,
                  },
                  true,
                );
              } else {
                update_preferences(
                  {
                    block_external_content: false,
                    block_tracking_pixels: false,
                  },
                  true,
                );
              }
            }}
          />
        </div>

        {preferences.block_external_content && (
          <>
            <div className="flex items-center justify-between py-4">
              <div className="flex-1 pe-4">
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                  {t("settings.block_spy_pixels")}
                  <InfoPopover
                    description={t("settings.info_spy_pixels_description")}
                    title={t("settings.info_spy_pixels_title")}
                  />
                </p>
                <p className="text-sm mt-0.5 text-txt-muted">
                  {t("settings.block_spy_pixels_description")}
                </p>
              </div>
              <Switch
                aria-label={t("settings.block_spy_pixels")}
                checked={preferences.block_tracking_pixels}
                size="lg"
                onCheckedChange={() =>
                  update_preference(
                    "block_tracking_pixels",
                    !preferences.block_tracking_pixels,
                    true,
                  )
                }
              />
            </div>

            <div className="flex items-center justify-between py-4">
              <div className="flex-1 pe-4">
                <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                  {t("settings.block_tracking_links")}
                  <InfoPopover
                    description={t(
                      "settings.info_block_tracking_links_description",
                    )}
                    title={t("settings.info_block_tracking_links_title")}
                  />
                </p>
                <p className="text-sm mt-0.5 text-txt-muted">
                  {t("settings.block_tracking_links_description")}
                </p>
              </div>
              {preferences.block_external_content ? (
                <Badge color="green">{t("common.active")}</Badge>
              ) : (
                <Badge color="gray">{t("common.inactive")}</Badge>
              )}
            </div>
          </>
        )}
      </div>

      <div id="sec-images">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PhotoIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.images_section_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.block_remote_images_label")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.block_remote_images_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.block_remote_images_label")}
            checked={preferences.block_remote_images}
            size="lg"
            onCheckedChange={() => {
              const new_value = !preferences.block_remote_images;

              update_preferences(
                {
                  block_remote_images: new_value,
                  load_remote_images: new_value ? "never" : "always",
                },
                true,
              );
            }}
          />
        </div>

        {preferences.block_remote_images && (
          <div className="flex items-center justify-between py-4">
            <div className="flex-1 pe-4">
              <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("settings.remote_image_loading")}
                <InfoPopover
                  description={t(
                    "settings.info_remote_image_loading_description",
                  )}
                  title={t("settings.info_remote_image_loading_title")}
                />
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.remote_image_loading_description")}
              </p>
            </div>
            <Select
              value={preferences.load_remote_images || "never"}
              onValueChange={(v) => {
                update_preference(
                  "load_remote_images",
                  v as "always" | "ask" | "never",
                  true,
                );
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">
                  {t("settings.remote_images_never")}
                </SelectItem>
                <SelectItem value="ask">
                  {t("settings.remote_images_ask")}
                </SelectItem>
                <SelectItem value="always">
                  {t("settings.remote_images_always")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.block_remote_fonts_label")}
              <InfoPopover
                description={t("settings.info_block_fonts_description")}
                title={t("settings.info_block_fonts_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.block_remote_fonts_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.block_remote_fonts_label")}
            checked={preferences.block_remote_fonts}
            size="lg"
            onCheckedChange={() =>
              update_preference(
                "block_remote_fonts",
                !preferences.block_remote_fonts,
                true,
              )
            }
          />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.block_remote_css_label")}
              <InfoPopover
                description={t("settings.info_block_css_description")}
                title={t("settings.info_block_css_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.block_remote_css_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.block_remote_css_label")}
            checked={preferences.block_remote_css}
            size="lg"
            onCheckedChange={() =>
              update_preference(
                "block_remote_css",
                !preferences.block_remote_css,
                true,
              )
            }
          />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("settings.strip_exif_on_compose_label")}
              <InfoPopover
                description={t("settings.info_strip_exif_description")}
                title={t("settings.info_strip_exif_title")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.strip_exif_on_compose_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.strip_exif_on_compose_label")}
            checked={preferences.strip_exif_on_compose}
            size="lg"
            onCheckedChange={() =>
              update_preference(
                "strip_exif_on_compose",
                !preferences.strip_exif_on_compose,
                true,
              )
            }
          />
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <CodeBracketIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.html_content_section_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.html_rendering_mode_label")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.html_rendering_mode_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.html_rendering_mode_label")}
            checked={preferences.html_rendering_mode === "plain_text"}
            size="lg"
            onCheckedChange={() =>
              update_preference(
                "html_rendering_mode",
                preferences.html_rendering_mode === "plain_text"
                  ? "html"
                  : "plain_text",
                true,
              )
            }
          />
        </div>
      </div>

      <div id="sec-vanguard">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <CpuChipIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.vanguard_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <VanguardSection />
      </div>

      <div className="pt-3">
        <ConnectionSection />
      </div>

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

      <TotpDisableModal
        is_open={security.show_totp_disable_modal}
        on_close={() => security.set_show_totp_disable_modal(false)}
        on_success={security.handle_totp_disable_success}
      />

      <RegenerateBackupCodesModal
        is_open={show_regenerate_modal}
        on_close={() => set_show_regenerate_modal(false)}
        on_success={security.fetch_totp_status}
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

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.turn_off_action")}
        is_open={pending_disable !== null}
        message={
          pending_disable ? confirm_disable_copy[pending_disable].message : ""
        }
        on_cancel={() => set_pending_disable(null)}
        on_confirm={handle_confirmed_disable}
        title={
          pending_disable ? confirm_disable_copy[pending_disable].title : ""
        }
        variant="danger"
      />
    </div>
  );
}
