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
import type { Badge, BadgePreferences } from "@/services/api/user";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CameraIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { StepUpModal } from "./step_up_modal";
import type { StepUpCredentials } from "@/services/api/step_up";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { use_should_reduce_motion } from "@/provider";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { PROFILE_COLORS } from "@/constants/profile";
import { get_initials, get_active_locale } from "@/lib/initials";
import { get_contrast_text } from "@/lib/avatar_color";
import {
  get_inactivity_warning_months,
  format_month_amount,
} from "@/lib/inactivity_policy";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_primary_identity } from "@/lib/primary_identity";
import {
  update_display_name,
  update_profile_color,
  fetch_my_badges,
  fetch_badge_preferences,
  update_badge_preferences,
} from "@/services/api/user";
import {
  get_inactivity_settings,
  set_inactivity_settings,
} from "@/services/api/auth";
import { get_badge_visual } from "@/components/ui/badge_registry";
import { set_my_badge_prefs } from "@/stores/my_badge_prefs_store";
import { cn } from "@/lib/utils";
import {
  get_recovery_email,
  save_recovery_email,
  resend_recovery_verification,
  remove_recovery_email,
} from "@/services/api/recovery_email";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoPopover } from "@/components/ui/info_popover";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  PROFILE_PICTURE_ACCEPT,
  use_profile_picture_upload,
} from "@/hooks/use_profile_picture_upload";
import { is_onion_host } from "@/lib/onion_host";

function mask_email(email: string): string {
  const [local, domain] = email.split("@");

  if (!domain) return email;
  const masked_local = local.length > 0 ? local[0] + "***" : "***";

  return `${masked_local}@${domain}`;
}

interface RecoveryModalProps {
  is_open: boolean;
  on_close: () => void;
  on_save: (email: string) => Promise<void>;
  current: string | null;
}

function RecoveryModal({
  is_open,
  on_close,
  on_save,
  current,
}: RecoveryModalProps) {
  const { t } = use_i18n();
  const [email, set_email] = useState(current || "");
  const [saving, set_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (is_open) {
      set_email(current || "");
      set_error(null);
    }
  }, [is_open, current]);

  const handle_save = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      set_error(t("common.enter_valid_email"));

      return;
    }
    set_saving(true);
    try {
      await on_save(email);
      on_close();
    } catch (err) {
      set_error(
        err instanceof Error ? err.message : t("common.failed_to_save"),
      );
    } finally {
      set_saving(false);
    }
  };

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("common.recovery_email")}</ModalTitle>
        <ModalDescription>
          {t("common.recovery_email_modal_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <Input
          autoFocus
          placeholder={t("common.enter_recovery_email")}
          status={error ? "error" : "default"}
          type="email"
          value={email}
          onChange={(e) => set_email(e.target.value)}
          onKeyDown={(e) => e["key"] === "Enter" && handle_save()}
        />
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button disabled={saving} onClick={handle_save}>
          {saving ? (
            <>
              {t("common.saving")}
              <Spinner className="ml-2" size="md" />
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function navigate_to_billing() {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", { detail: "billing" }),
  );
}

function FreePlanBanner() {
  const { t } = use_i18n();
  const { limits } = use_plan_limits();

  if (is_onion_host() || !limits || limits.plan_code !== "free") return null;

  return (
    <div className="rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CreditCardIcon className="h-5 w-5 flex-shrink-0 text-blue-600" />
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.free_plan_banner_title")}
            </p>
          </div>
          <p className="text-sm text-txt-muted mt-1 ml-7">
            {t("settings.free_plan_description")}
          </p>
        </div>
        <button
          className="flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          type="button"
          onClick={navigate_to_billing}
        >
          {t("settings.upgrade_view_plans")}
        </button>
      </div>
    </div>
  );
}

export function AccountSection() {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { user, update_user, vault } = use_auth();
  const account_email = user?.email ?? "";
  const primary_identity = use_primary_identity(account_email);
  const { preferences, update_preference, reset_to_defaults } =
    use_preferences();
  const {
    file_ref,
    uploading,
    removing: removing_photo,
    preview,
    error: photo_error,
    open_picker,
    handle_file,
    remove_picture,
  } = use_profile_picture_upload();

  const copy_primary_address = useCallback(
    async (address: string) => {
      try {
        await navigator.clipboard.writeText(address);
        show_toast(t("common.copied"), "success");
      } catch {
        show_toast(t("common.failed_to_copy_to_clipboard"), "error");
      }
    },
    [t],
  );

  const [color, set_color] = useState(
    preferences.profile_color || PROFILE_COLORS[5],
  );
  const [name, set_name] = useState(user?.display_name || user?.username || "");
  const [saving_name, set_saving_name] = useState(false);
  const [avatar_hovered, set_avatar_hovered] = useState(false);
  const [recovery, set_recovery] = useState<{
    email: string | null;
    verified: boolean;
  }>({ email: null, verified: false });
  const [show_modal, set_show_modal] = useState(false);
  const [pending, set_pending] = useState(false);
  const [resending, set_resending] = useState(false);
  const [show_reset_confirm, set_show_reset_confirm] = useState(false);
  const [show_step_up, set_show_step_up] = useState(false);
  const [step_up_mode, set_step_up_mode] = useState<
    "change" | "remove" | "inactivity"
  >("change");
  const [pending_recovery_email, set_pending_recovery_email] = useState("");
  const [pending_inactivity_months, set_pending_inactivity_months] = useState<
    number | null
  >(null);
  const [inactivity_window, set_inactivity_window] = useState(24);
  const [saving_inactivity, set_saving_inactivity] = useState(false);
  const [badges, set_badges] = useState<Badge[]>([]);
  const [badge_prefs, set_badge_prefs] = useState<BadgePreferences | null>(null);
  const [is_initial_load, set_is_initial_load] = useState(true);

  const inactivity_window_info_description = (() => {
    const [first, second, final] =
      get_inactivity_warning_months(inactivity_window);
    const format_offset = (months: number) =>
      t("common.inactivity_window_months").replace(
        "{{n}}",
        format_month_amount(months),
      );

    return t("common.inactivity_window_info_description")
      .replace("{{first}}", format_offset(first))
      .replace("{{second}}", format_offset(second))
      .replace("{{final}}", format_offset(final));
  })();

  useEffect(() => {
    const run = async () => {
      try {
        const [badges_response, prefs_response, recovery_response, inactivity_response] =
          await Promise.all([
            fetch_my_badges(),
            fetch_badge_preferences(),
            vault
              ? get_recovery_email(vault).catch(() => ({
                  data: { email: null, verified: false },
                }))
              : Promise.resolve({ data: { email: null, verified: false } }),
            get_inactivity_settings(),
          ]);

        if (badges_response.data) set_badges(badges_response.data);
        if (prefs_response.data) {
          set_badge_prefs(prefs_response.data);
          set_my_badge_prefs(prefs_response.data);
        }
        if (recovery_response.data) set_recovery(recovery_response.data);
        if (inactivity_response.data)
          set_inactivity_window(inactivity_response.data.inactivity_window_months);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      } finally {
        set_is_initial_load(false);
      }
    };

    run();
  }, [vault]);

  const persist_badge_prefs = async (patch: {
    active_badge_slug?: string | null;
    show_badge_profile?: boolean;
    show_badge_signature?: boolean;
    show_badge_ring?: boolean;
  }) => {
    if (!badge_prefs) return;
    const previous = badge_prefs;
    const optimistic: BadgePreferences = { ...badge_prefs, ...patch };
    set_badge_prefs(optimistic);
    set_my_badge_prefs(optimistic);
    try {
      const response = await update_badge_preferences(patch);
      if (response.data) {
        set_badge_prefs(response.data);
        set_my_badge_prefs(response.data);
      } else {
        set_badge_prefs(previous);
        set_my_badge_prefs(previous);
        show_toast(response.error || t("badges.claim_failed"), "error");
      }
    } catch {
      set_badge_prefs(previous);
      set_my_badge_prefs(previous);
      show_toast(t("badges.claim_failed"), "error");
    }
  };

  useEffect(() => {
    set_name(user?.display_name || user?.username || "");
  }, [user]);

  useEffect(() => {
    if (preferences.profile_color) {
      set_color(preferences.profile_color);
    }
  }, [preferences.profile_color]);

  const save_name = async () => {
    if (!name.trim() || !user || name === (user.display_name || user.username))
      return;
    set_saving_name(true);
    try {
      const r = await update_display_name(name);

      if (r.data?.user)
        await update_user({
          ...user,
          display_name: r.data.user.display_name || undefined,
        });
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);

      return;
    }
    set_saving_name(false);
  };


  const save_recovery = async (email: string) => {
    if (!vault) return;

    if (recovery.email) {
      set_pending_recovery_email(email);
      set_step_up_mode("change");
      set_show_step_up(true);

      return;
    }

    const r = await save_recovery_email(email, vault);

    if (r.code === "CONFLICT") {
      throw new Error(t("common.recovery_conflict"));
    }
    if (!r.data.success) {
      throw new Error(r.error || t("common.failed_to_save"));
    }

    set_recovery({ email, verified: false });
    set_pending(true);
  };

  const handle_step_up_confirm = async (credentials: StepUpCredentials) => {
    if (step_up_mode === "inactivity") {
      if (pending_inactivity_months === null) return;

      const months = pending_inactivity_months;

      set_saving_inactivity(true);
      try {
        const r = await set_inactivity_settings(months, credentials);

        if (r.error) {
          throw new Error(r.error || t("common.step_up_error"));
        }

        set_inactivity_window(months);
        show_toast(t("common.inactivity_window_saved"), "success");
        set_show_step_up(false);
        set_pending_inactivity_months(null);
      } finally {
        set_saving_inactivity(false);
      }

      return;
    }

    if (step_up_mode === "change") {
      if (!vault) throw new Error(t("common.failed_to_save"));
      const r = await save_recovery_email(
        pending_recovery_email,
        vault,
        credentials,
      );

      if (r.code === "CONFLICT") {
        throw new Error(t("common.recovery_conflict"));
      }
      if (!r.data.success) {
        throw new Error(r.error || t("common.step_up_error"));
      }

      set_recovery({ email: pending_recovery_email, verified: false });
      set_pending(true);
      set_show_step_up(false);
    } else {
      const r = await remove_recovery_email(credentials);

      if (!r.data.success) {
        throw new Error(r.error || t("common.step_up_error"));
      }

      set_recovery({ email: null, verified: false });
      set_pending(false);
      set_show_step_up(false);
      show_toast(t("common.recovery_email_removed"), "success");
    }
  };

  const handle_resend = async () => {
    if (resending) return;
    set_resending(true);
    try {
      const r = await resend_recovery_verification();

      if (r.data.success) {
        set_pending(true);
        show_toast(t("common.verification_email_sent"), "success");
      } else {
        show_toast(t("common.failed_verification_email"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_send_verification"), "error");
    } finally {
      set_resending(false);
    }
  };


  const request_inactivity_window_change = (months: number) => {
    if (months < 3 || months > 24) return;
    set_pending_inactivity_months(months);
    set_step_up_mode("inactivity");
    set_show_step_up(true);
  };

  const has_custom_picture = !!(preview || user?.profile_picture);
  const picture = preview || user?.profile_picture || "/profile.webp";

  if (is_initial_load) {
    return <SettingsSkeleton variant="profile" />;
  }

  return (
    <div className="space-y-4">
      <FreePlanBanner />

      <div className="rounded-xl overflow-hidden bg-surf-tertiary border border-edge-secondary">
        <div
          className="h-20"
          style={{
            backgroundColor: color,
          }}
        />
        <div className="px-5 pb-5 -mt-8 flex items-end justify-between">
          <div
            className="relative"
            onMouseEnter={() => set_avatar_hovered(true)}
            onMouseLeave={() => set_avatar_hovered(false)}
          >
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg relative bg-surf-primary">
              {has_custom_picture ? (
                <img
                  alt=""
                  className="w-full h-full object-cover rounded-xl"
                  src={picture}
                />
              ) : (
                <div
                  className="w-full h-full rounded-xl flex items-center justify-center select-none"
                  style={{
                    backgroundColor: color,
                    boxShadow:
                      "inset 0 -3px 8px rgba(0,0,0,0.25), inset 0 1px 3px rgba(255,255,255,0.2)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 600,
                      lineHeight: 1,
                      color: get_contrast_text(color),
                    }}
                  >
                    {get_initials(name, user?.email, get_active_locale())}
                  </span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                  <Spinner className="text-white" size="md" />
                </div>
              )}
            </div>
            <button
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full transition-colors disabled:opacity-50 bg-surf-card text-txt-muted border-2 border-edge-secondary"
              aria-label={t("auth.change_photo")}
              disabled={uploading || removing_photo}
              title={t("auth.change_photo")}
              onClick={open_picker}
              onMouseEnter={(e) => {
                if (!uploading) {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                }
              }}
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--bg-card)")
              }
            >
              {uploading ? (
                <Spinner size="xs" />
              ) : (
                <CameraIcon className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={file_ref}
              accept={PROFILE_PICTURE_ACCEPT}
              className="hidden"
              type="file"
              onChange={handle_file}
            />
            {user?.profile_picture && (
              <button
                aria-label={t("common.remove_photo")}
                className={cn(
                  "absolute -top-1 -right-1 p-1.5 rounded-full transition disabled:opacity-50 bg-surf-card text-txt-muted border-2 border-edge-secondary hover:text-[var(--color-danger)] focus-visible:opacity-100",
                  avatar_hovered || removing_photo
                    ? "opacity-100"
                    : "opacity-0 [@media(hover:none)]:opacity-100",
                )}
                disabled={uploading || removing_photo}
                onFocus={() => set_avatar_hovered(true)}
                onBlur={() => set_avatar_hovered(false)}
                title={t("common.remove_photo")}
                onClick={remove_picture}
              >
                {removing_photo ? (
                  <Spinner size="xs" />
                ) : (
                  <XMarkIcon className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
          {photo_error && (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-medium mt-2"
              exit={{ opacity: 0, y: -5 }}
              initial={reduce_motion ? false : { opacity: 0, y: -5 }}
              style={{ color: "var(--color-danger)" }}
            >
              {photo_error}
            </motion.p>
          )}
          <div className="flex items-center gap-2.5">
            {PROFILE_COLORS.map((c) => {
              const is_selected = c === color;

              return (
                <button
                  key={c}
                  className="relative w-9 h-9 rounded-full"
                  style={{
                    backgroundColor: c,
                    boxShadow: is_selected
                      ? `0 0 0 2px var(--bg-tertiary), 0 0 0 3.5px ${c}, 0 2px 8px ${c}50`
                      : `inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15), 0 2px 6px ${c}30`,
                  }}
                  onClick={async () => {
                    const prev = color;

                    set_color(c);
                    update_preference("profile_color", c, true);
                    if (user) {
                      await update_user({ ...user, profile_color: c });
                    }
                    const response = await update_profile_color(c);

                    if (response.error) {
                      set_color(prev);
                      update_preference("profile_color", prev, true);
                      if (user) {
                        await update_user({
                          ...user,
                          profile_color: prev || undefined,
                        });
                      }
                      show_toast(
                        t("common.failed_save_profile_color"),
                        "error",
                      );
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.primary_address_label")}
          </p>
          {primary_identity.is_custom && account_email && (
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.also_receives_at", { email: account_email })}
            </p>
          )}
        </div>
        <div
          className="cursor-pointer rounded-md px-2 -mr-2 py-1 hover:bg-surf-hover transition-colors"
          onClick={() =>
            copy_primary_address(primary_identity.email || account_email)
          }
        >
          <span className="text-sm font-medium text-txt-secondary truncate max-w-[16rem]">
            {primary_identity.email || account_email}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.display_name")}
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("common.display_name_visible")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="w-48"
            value={name}
            onBlur={save_name}
            onChange={(e) => set_name(e.target.value)}
            onKeyDown={(e) => e["key"] === "Enter" && save_name()}
          />
          {saving_name && <Spinner className="text-txt-muted" size="md" />}
        </div>
      </div>

      {badges.length > 0 && badge_prefs && (
        <div className="py-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
                {t("badges.active_badge")}
                <InfoPopover
                  description={t("settings.badges_description_full")}
                  title={t("badges.active_badge")}
                />
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.badges_description")}
              </p>
            </div>
            <Select
              value={badge_prefs.active_badge_slug ?? "none"}
              onValueChange={(v) =>
                persist_badge_prefs({
                  active_badge_slug: v === "none" ? null : v,
                })
              }
            >
              <SelectTrigger className="h-10 w-48 flex-shrink-0 bg-transparent text-sm">

                <SelectValue placeholder={t("badges.none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("badges.none")}
                </SelectItem>
                {badges.map((badge) => {
                  const visual = get_badge_visual(badge.slug);
                  const Icon = visual.icon;

                  return (
                    <SelectItem
                      key={badge.slug}
                      title={badge.description || undefined}
                      value={badge.slug}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{badge.display_name}</span>
                        {badge.find_order != null && (
                          <span className="tabular-nums opacity-70">
                            #{badge.find_order.toLocaleString()}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {badge_prefs.active_badge_slug && (
            <>
              <BadgeToggleRow
                checked={badge_prefs.show_badge_profile}
                description={t("badges.show_on_profile_description")}
                label={t("badges.show_on_profile")}
                on_change={(v) => persist_badge_prefs({ show_badge_profile: v })}
              />
              <BadgeToggleRow
                checked={badge_prefs.show_badge_signature}
                description={t("badges.show_in_signature_description")}
                label={t("badges.show_in_signature")}
                on_change={(v) =>
                  persist_badge_prefs({ show_badge_signature: v })
                }
              />
            </>
          )}
        </div>
      )}

      <div className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-txt-primary">
              {t("common.recovery_email")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("common.recovery_email_description")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {recovery.email && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-txt-secondary">
                  {mask_email(recovery.email)}
                </span>
                {recovery.verified ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircleIcon className="w-4 h-4" />
                    {t("common.verified")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <ExclamationCircleIcon className="w-4 h-4" />
                    {t("common.not_verified")}
                  </span>
                )}
              </div>
            )}
            <Button variant="secondary" onClick={() => set_show_modal(true)}>
              {recovery.email ? t("common.update") : t("common.add")}
            </Button>
            {recovery.email && !recovery.verified && (
              <Button
                disabled={resending}
                variant="ghost"
                onClick={handle_resend}
              >
                {resending ? <Spinner size="md" /> : t("common.resend")}
              </Button>
            )}
            {recovery.email && (
              <Button
                variant="ghost"
                onClick={() => {
                  set_step_up_mode("remove");
                  set_show_step_up(true);
                }}
              >
                {t("common.remove")}
              </Button>
            )}
          </div>
        </div>
        {pending && recovery.email && !recovery.verified && (
          <p className="text-sm mt-3 text-txt-tertiary">
            {t("common.verification_sent").replace(
              "{{email}}",
              mask_email(recovery.email),
            )}
          </p>
        )}
      </div>

      <div className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
              {t("common.inactivity_window")}
              <InfoPopover title={t("common.inactivity_window_info_title")} description={inactivity_window_info_description} learn_more_url="https://astermail.org/terms#section-9" />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("common.inactivity_window_description")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              disabled={saving_inactivity}
              value={String(inactivity_window)}
              onValueChange={(v) => request_inactivity_window_change(Number(v))}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 6, 9, 12, 18, 24].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t("common.inactivity_window_months").replace("{{n}}", String(m))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-txt-primary">
              {t("common.reset_all_settings")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("common.restore_defaults_description")}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => set_show_reset_confirm(true)}
          >
            {t("settings.reset")}
          </Button>
        </div>
      </div>

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.reset")}
        is_open={show_reset_confirm}
        message={t("common.reset_confirm_message")}
        on_cancel={() => set_show_reset_confirm(false)}
        on_confirm={() => {
          reset_to_defaults();
          set_show_reset_confirm(false);
          show_toast(t("common.all_settings_reset"), "success");
        }}
        title={t("common.reset_all_settings")}
        variant="warning"
      />

      <StepUpModal
        confirm_label={
          step_up_mode === "remove" ? t("common.remove") : t("common.save")
        }
        description={
          step_up_mode === "inactivity"
            ? t("common.inactivity_window_step_up_description")
            : t("common.step_up_description")
        }
        destructive={step_up_mode === "remove"}
        is_open={show_step_up}
        on_close={() => {
          set_show_step_up(false);
          if (step_up_mode === "inactivity") set_pending_inactivity_months(null);
        }}
        on_confirm={handle_step_up_confirm}
        title={
          step_up_mode === "remove"
            ? t("common.remove_recovery_email")
            : step_up_mode === "inactivity"
              ? t("common.inactivity_window")
              : t("common.recovery_email")
        }
      />

      <RecoveryModal
        current={recovery.email}
        is_open={show_modal}
        on_close={() => set_show_modal(false)}
        on_save={save_recovery}
      />
    </div>
  );
}

interface BadgeToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  on_change: (value: boolean) => void;
}

function BadgeToggleRow({
  label,
  description,
  checked,
  on_change,
}: BadgeToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-txt-primary">{label}</div>
        <div className="text-xs mt-0.5 text-txt-muted">{description}</div>
      </div>
      <Switch size="lg" checked={checked} onCheckedChange={on_change} />
    </div>
  );
}
