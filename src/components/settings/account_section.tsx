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
import type { StepUpCredentials } from "@/services/api/step_up";
import type { RecoveryEmailData } from "@/services/api/recovery_email";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  CameraIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardIcon,
  ExclamationCircleIcon,
  LockClosedIcon,
  PencilSquareIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Island, IslandRow, IslandSection, IslandSections } from "@aster/ui";

import { StepUpModal } from "./step_up_modal";

import { Button } from "@/components/ui/button";
import { ChangePrimaryAddressModal } from "@/components/settings/change_primary_address_modal";
import {
  load_primary_address_eligibility,
  primary_address_eligibility_failed,
  PRIMARY_ADDRESS_FEATURE_KEY,
  type PrimaryAddressEligibility,
} from "@/services/api/primary_address";
import { copy_text_or_throw } from "@/utils/copy_text";
import { ignore_error } from "@/lib/ignore_error";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
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
import { format_date } from "@/utils/date_format";
import {
  get_recovery_email,
  save_recovery_email,
  resend_recovery_verification,
  remove_recovery_email,
  normalize_recovery_email,
  EMPTY_RECOVERY_EMAIL,
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
import { open_profile_picture_dialog } from "@/stores/profile_picture_dialog_store";
import { is_onion_host } from "@/lib/onion_host";
import { SETTINGS_ANCHORS } from "@/lib/settings_links";
import {
  show_plan_limit_upgrade,
  show_upgrade_plans,
} from "@/stores/upgrade_store";
import { app_locale } from "@/utils/date_format";
import { is_composing } from "@/utils/ime";
import { MAX_DISPLAY_NAME_LENGTH } from "@/services/sanitize";
import { user_facing_error } from "@/utils/user_facing_error";

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
    const trimmed_email = email.trim();

    if (!trimmed_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed_email)) {
      set_error(t("common.enter_valid_email"));

      return;
    }
    set_saving(true);
    try {
      await on_save(trimmed_email);
      on_close();
    } catch (err) {
      set_error(user_facing_error(err, t("common.failed_to_save")));
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
          onKeyDown={(e) =>
            e["key"] === "Enter" && !is_composing(e) && handle_save()
          }
        />
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button disabled={saving} is_loading={saving} onClick={handle_save}>
          {t("common.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function FreePlanBanner() {
  const { t } = use_i18n();
  const { limits } = use_plan_limits();

  if (is_onion_host() || !limits || limits.plan_code !== "free") return null;

  return (
    <Island padding="md" tone="accent">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <span className="hidden h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[var(--accent-fg)] sm:flex">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-5 text-txt-primary">
            {t("settings.free_plan_banner_title")}
          </p>
          <p className="mt-0.5 text-[13px] leading-5 text-txt-secondary">
            {t("settings.free_plan_description")}
          </p>
        </div>
        <Button
          className="flex-shrink-0"
          size="md"
          variant="depth"
          onClick={() => show_upgrade_plans()}
        >
          {t("settings.upgrade_view_plans")}
        </Button>
      </div>
    </Island>
  );
}

export function AccountSection() {
  const { t } = use_i18n();
  const { user, update_user, vault } = use_auth();
  const account_email = user?.email ?? "";
  const { preferences, update_preference, reset_to_defaults } =
    use_preferences();

  const copy_primary_address = useCallback(
    async (address: string) => {
      try {
        await copy_text_or_throw(address);
        show_toast(t("common.copied"), "success");
      } catch {
        show_toast(t("common.failed_to_copy_to_clipboard"), "error");
      }
    },
    [t],
  );

  const [color, set_color] = useState(
    user?.profile_color || preferences.profile_color || PROFILE_COLORS[5],
  );
  const color_saving_ref = useRef(false);
  const [name, set_name] = useState(user?.display_name || user?.username || "");
  const [saving_name, set_saving_name] = useState(false);
  const [recovery, set_recovery] =
    useState<RecoveryEmailData>(EMPTY_RECOVERY_EMAIL);
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
  const [badge_prefs, set_badge_prefs] = useState<BadgePreferences | null>(
    null,
  );
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [load_failed, set_load_failed] = useState(false);
  const [address_eligibility, set_address_eligibility] =
    useState<PrimaryAddressEligibility | null>(null);
  const [show_address_change, set_show_address_change] = useState(false);
  const [address_eligibility_failed, set_address_eligibility_failed] =
    useState(false);

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

  const load_account_data = useCallback(async () => {
    set_load_failed(false);

    const [
      badges_response,
      prefs_response,
      recovery_response,
      inactivity_response,
      eligibility_response,
    ] = await Promise.all([
      fetch_my_badges(),
      fetch_badge_preferences(),
      vault
        ? get_recovery_email(vault).catch(() => ({
            data: EMPTY_RECOVERY_EMAIL,
          }))
        : Promise.resolve({ data: EMPTY_RECOVERY_EMAIL }),
      get_inactivity_settings(),
      load_primary_address_eligibility(),
    ]);

    if (badges_response.data) set_badges(badges_response.data);
    if (prefs_response.data) {
      set_badge_prefs(prefs_response.data);
      set_my_badge_prefs(prefs_response.data);
    }
    if (recovery_response.data) set_recovery(recovery_response.data);
    if (inactivity_response.data)
      set_inactivity_window(inactivity_response.data.inactivity_window_months);
    set_address_eligibility((prev) => eligibility_response.data ?? prev);
    set_address_eligibility_failed(
      primary_address_eligibility_failed(eligibility_response),
    );

    if (
      !badges_response.data ||
      !prefs_response.data ||
      !inactivity_response.data
    ) {
      set_load_failed(true);
    }

    set_is_initial_load(false);
  }, [vault]);

  const reload_account_data = useCallback(() => {
    load_account_data().catch(() => {
      set_load_failed(true);
      set_is_initial_load(false);
    });
  }, [load_account_data]);

  useEffect(() => {
    reload_account_data();
  }, [reload_account_data]);

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

  const retry_address_eligibility = useCallback(async () => {
    set_address_eligibility_failed(false);

    const response = await load_primary_address_eligibility();

    set_address_eligibility((prev) => response.data ?? prev);
    set_address_eligibility_failed(
      primary_address_eligibility_failed(response),
    );
  }, []);

  const can_change_address = !!address_eligibility;
  const address_plan_locked =
    !!address_eligibility &&
    !address_eligibility.eligible &&
    address_eligibility.reason === "plan";

  const address_cooldown_date = (() => {
    const raw = address_eligibility?.next_change_available_at;
    const parsed = raw ? new Date(raw) : null;

    if (!parsed || Number.isNaN(parsed.getTime())) return "";

    return format_date(parsed);
  })();

  const address_lock_message = (() => {
    if (!address_eligibility || address_eligibility.eligible) return null;

    switch (address_eligibility.reason) {
      case "plan":
        return t("settings.address_change_locked_plan");
      case "account_kind":
        return t("settings.address_change_locked_account_kind");
      case "custom_domain":
        return t("settings.address_change_locked_custom_domain");
      case "cooldown":
        return address_cooldown_date
          ? t("settings.address_change_locked_cooldown", {
              date: address_cooldown_date,
            })
          : t("settings.address_change_locked_cooldown_unknown");
      default:
        return t("settings.address_change_locked_unavailable");
    }
  })();

  const handle_address_changed = useCallback(
    async (new_address: string) => {
      if (user) {
        await update_user({
          ...user,
          email: new_address,
          username: new_address.slice(0, new_address.lastIndexOf("@")),
        });
      }

      show_toast(t("settings.primary_address_set"), "success");
      reload_account_data();
    },
    [user, update_user, t, reload_account_data],
  );

  const derived_name = user?.display_name || user?.username || "";
  const derived_name_ref = useRef(derived_name);

  useEffect(() => {
    const previous = derived_name_ref.current;

    derived_name_ref.current = derived_name;
    set_name((current) =>
      current === previous || current.trim() === "" ? derived_name : current,
    );
  }, [derived_name]);

  useEffect(() => {
    if (color_saving_ref.current) return;

    const synced_color = user?.profile_color || preferences.profile_color;

    if (synced_color) {
      set_color(synced_color);
    }
  }, [user?.profile_color, preferences.profile_color]);

  const save_name = async () => {
    if (saving_name) return;
    if (!name.trim() || !user || name === (user.display_name || user.username))
      return;
    set_saving_name(true);
    try {
      const r = await update_display_name(name);

      if (r.data?.user) {
        await update_user({
          ...user,
          display_name: r.data.user.display_name || undefined,
        });
      } else {
        show_toast(r.error || t("common.failed_to_save"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_to_save"), "error");
    } finally {
      set_saving_name(false);
    }
  };

  const request_recovery_step_up = (email: string) => {
    set_pending_recovery_email(email);
    set_step_up_mode("change");
    set_show_step_up(true);
  };

  const save_recovery = async (email: string) => {
    if (!vault) throw new Error(t("common.failed_to_save"));

    const normalized = normalize_recovery_email(email);

    if (recovery.step_up_required) {
      request_recovery_step_up(normalized);

      return;
    }

    const r = await save_recovery_email(normalized, vault);

    if (r.code === "STEP_UP_REQUIRED" || r.code === "TOTP_REQUIRED") {
      request_recovery_step_up(normalized);

      return;
    }
    if (r.code === "CONFLICT") {
      throw new Error(t("common.recovery_conflict"));
    }
    if (!r.data.success) {
      throw new Error(r.error || t("common.failed_to_save"));
    }

    set_recovery({
      email: normalized,
      verified: false,
      exists: true,
      step_up_required: false,
    });
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

      set_recovery({
        email: pending_recovery_email,
        verified: false,
        exists: true,
        step_up_required: false,
      });
      set_pending(true);
      set_show_step_up(false);
    } else {
      const r = await remove_recovery_email(credentials);

      if (!r.data.success) {
        throw new Error(r.error || t("common.step_up_error"));
      }

      set_recovery(EMPTY_RECOVERY_EMAIL);
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
        show_toast(r.error || t("common.failed_verification_email"), "error");
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

  const has_custom_picture = !!user?.profile_picture;
  const picture = user?.profile_picture || "/profile.webp";

  if (is_initial_load) {
    return <SettingsSkeleton variant="profile" />;
  }

  return (
    <IslandSections>
      <FreePlanBanner />

      {load_failed && <LoadFailedNotice on_retry={reload_account_data} />}

      <Island className="overflow-hidden">
        <div
          className="h-20"
          style={{
            backgroundColor: color,
          }}
        />
        <div className="px-5 pb-5 -mt-8 flex items-end justify-between">
          <button
            aria-label={t("auth.change_photo")}
            className="group relative h-20 w-20 rounded-full overflow-hidden bg-surf-primary ring-4 ring-[var(--aster-island-fill,var(--bg-primary))] focus:outline-none focus-visible:ring-[var(--accent-color)]"
            title={t("auth.change_photo")}
            type="button"
            onClick={open_profile_picture_dialog}
          >
            {has_custom_picture ? (
              <img
                alt=""
                className="w-full h-full object-cover rounded-full"
                draggable={false}
                src={picture}
              />
            ) : (
              <span
                className="w-full h-full rounded-full flex items-center justify-center select-none"
                style={{
                  backgroundColor: color,
                  fontSize: 26,
                  fontWeight: 600,
                  lineHeight: 1,
                  color: get_contrast_text(color),
                }}
              >
                {get_initials(name, user?.email, get_active_locale())}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 bg-black/55">
              <CameraIcon className="w-6 h-6 text-white" />
            </span>
          </button>
          <div
            aria-label={t("auth.profile_color")}
            className="flex items-center gap-2.5"
            role="radiogroup"
          >
            {PROFILE_COLORS.map((c) => {
              const is_selected = c === color;

              return (
                <button
                  key={c}
                  aria-checked={is_selected}
                  aria-label={c}
                  className="relative w-9 h-9 rounded-full"
                  role="radio"
                  style={{
                    backgroundColor: c,
                    outline: is_selected
                      ? "2px solid var(--text-primary)"
                      : "none",
                    outlineOffset: 2,
                    boxShadow: is_selected
                      ? `0 2px 8px ${c}50`
                      : `inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15), 0 2px 6px ${c}30`,
                  }}
                  type="button"
                  onClick={async () => {
                    const prev = color;
                    const revert = async () => {
                      set_color(prev);
                      update_preference("profile_color", prev, true);
                      if (user) {
                        await update_user({
                          ...user,
                          profile_color: prev || undefined,
                        }).catch((caught) =>
                          ignore_error(
                            "components/settings/account_section:revert_color",
                            caught,
                          ),
                        );
                      }
                      show_toast(
                        t("common.failed_save_profile_color"),
                        "error",
                      );
                    };

                    color_saving_ref.current = true;
                    try {
                      set_color(c);
                      update_preference("profile_color", c, true);
                      if (user) {
                        await update_user({ ...user, profile_color: c });
                      }
                      const response = await update_profile_color(c);

                      if (response.error) await revert();
                    } catch (caught) {
                      ignore_error(
                        "components/settings/account_section:update_color",
                        caught,
                      );
                      await revert();
                    } finally {
                      color_saving_ref.current = false;
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      </Island>

      {address_eligibility && can_change_address && (
        <ChangePrimaryAddressModal
          eligibility={address_eligibility}
          is_open={show_address_change}
          on_changed={handle_address_changed}
          on_close={() => set_show_address_change(false)}
        />
      )}

      <IslandSection divided>
        <IslandRow
          description={
            address_eligibility_failed ? (
              <>
                {t("settings.address_change_eligibility_failed")}{" "}
                <button
                  className="underline hover:text-txt-primary transition-colors"
                  type="button"
                  onClick={() => void retry_address_eligibility()}
                >
                  {t("common.retry")}
                </button>
              </>
            ) : undefined
          }
          label={
            <span className="inline-flex items-center gap-1.5">
              {t("settings.primary_address_label")}
              {can_change_address && (
                <InfoPopover
                  description={t("settings.primary_address_info")}
                  title={t("settings.primary_address_label")}
                />
              )}
            </span>
          }
          trailing={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 -me-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]"
                  type="button"
                >
                  <span className="block text-sm font-medium text-txt-secondary truncate max-w-[16rem]">
                    {account_email}
                  </span>
                  <ChevronDownIcon className="w-4 h-4 shrink-0 text-txt-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[13rem]">
                <DropdownMenuItem
                  onClick={() => copy_primary_address(account_email)}
                >
                  <ClipboardIcon className="w-4 h-4" />
                  {t("common.copy_address")}
                </DropdownMenuItem>
                {can_change_address && (
                  <DropdownMenuItem
                    className={
                      address_plan_locked ? "text-txt-muted" : undefined
                    }
                    disabled={
                      !address_eligibility?.eligible && !address_plan_locked
                    }
                    onClick={() => {
                      if (address_plan_locked) {
                        show_plan_limit_upgrade({
                          feature: PRIMARY_ADDRESS_FEATURE_KEY,
                          plan_code: "supernova",
                        });

                        return;
                      }

                      set_show_address_change(true);
                    }}
                  >
                    {address_plan_locked ? (
                      <LockClosedIcon className="w-4 h-4" />
                    ) : (
                      <PencilSquareIcon className="w-4 h-4" />
                    )}
                    {t("settings.change_address")}
                  </DropdownMenuItem>
                )}
                {can_change_address && !address_eligibility?.eligible && (
                  <p className="px-2 py-1.5 text-xs text-txt-muted">
                    {address_lock_message}
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />

        <IslandRow
          description={t("common.display_name_visible")}
          label={t("settings.display_name")}
          layout="stacked"
          trailing={
            <div className="relative">
              <Input
                aria-label={t("settings.display_name")}
                className="w-[220px] text-[13px] font-medium"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                value={name}
                onBlur={save_name}
                onChange={(e) => set_name(e.target.value)}
                onKeyDown={(e) =>
                  e["key"] === "Enter" && !is_composing(e) && save_name()
                }
              />
              {saving_name && (
                <Spinner
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none"
                  size="xs"
                />
              )}
            </div>
          }
        />

        {badges.length > 0 && badge_prefs && (
          <>
            <IslandRow
              description={t("settings.badges_description")}
              label={
                <span className="inline-flex items-center gap-1.5">
                  {t("badges.active_badge")}
                  <InfoPopover
                    description={t("settings.badges_description_full")}
                    title={t("badges.active_badge")}
                  />
                </span>
              }
              layout="stacked"
              trailing={
                <Select
                  value={badge_prefs.active_badge_slug ?? "none"}
                  onValueChange={(v) =>
                    persist_badge_prefs({
                      active_badge_slug: v === "none" ? null : v,
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-[220px] flex-shrink-0">
                    <SelectValue placeholder={t("badges.none")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("badges.none")}</SelectItem>
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
                            <span className="truncate">
                              {badge.display_name}
                            </span>
                            {badge.find_order != null && (
                              <span className="tabular-nums opacity-70">
                                #{badge.find_order.toLocaleString(app_locale())}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              }
            />
            {badge_prefs.active_badge_slug && (
              <>
                <IslandRow
                  description={t("badges.show_on_profile_description")}
                  label={t("badges.show_on_profile")}
                  toggle={{
                    checked: badge_prefs.show_badge_profile,
                    aria_label: t("badges.show_on_profile"),
                    on_change: (v) =>
                      persist_badge_prefs({ show_badge_profile: v }),
                  }}
                />
                <IslandRow
                  description={t("badges.show_in_signature_description")}
                  label={t("badges.show_in_signature")}
                  toggle={{
                    checked: badge_prefs.show_badge_signature,
                    aria_label: t("badges.show_in_signature"),
                    on_change: (v) =>
                      persist_badge_prefs({ show_badge_signature: v }),
                  }}
                />
              </>
            )}
          </>
        )}

        <IslandRow
          description={
            <>
              {t("common.recovery_email_description")}
              {pending && recovery.email && !recovery.verified && (
                <span className="block mt-1 text-txt-tertiary">
                  {t("common.verification_sent").replace(
                    "{{email}}",
                    mask_email(recovery.email),
                  )}
                </span>
              )}
            </>
          }
          id={SETTINGS_ANCHORS.recovery_email}
          label={t("common.recovery_email")}
          layout="stacked"
          trailing={
            <div className="flex flex-wrap items-center gap-2">
              {recovery.exists && (
                <div className="flex items-center gap-2 me-1">
                  <span className="text-sm font-medium text-txt-secondary">
                    {recovery.email
                      ? mask_email(recovery.email)
                      : t("common.recovery_email_hidden")}
                  </span>
                  {recovery.verified ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircleIcon className="w-4 h-4" />
                      {t("common.verified")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <ExclamationCircleIcon className="w-4 h-4" />
                      {t("common.not_verified")}
                    </span>
                  )}
                </div>
              )}
              <Button
                size="md"
                variant="secondary"
                onClick={() => set_show_modal(true)}
              >
                {recovery.exists ? t("common.update") : t("common.add")}
              </Button>
              {recovery.exists && !recovery.verified && (
                <Button
                  disabled={resending}
                  is_loading={resending}
                  size="md"
                  variant="outline"
                  onClick={handle_resend}
                >
                  {t("common.resend")}
                </Button>
              )}
              {recovery.exists && (
                <Button
                  size="md"
                  variant="outline"
                  onClick={() => {
                    set_step_up_mode("remove");
                    set_show_step_up(true);
                  }}
                >
                  {t("common.remove")}
                </Button>
              )}
            </div>
          }
        />

        <IslandRow
          description={t("common.inactivity_window_description")}
          label={
            <span className="inline-flex items-center gap-1.5">
              {t("common.inactivity_window")}
              <InfoPopover
                description={inactivity_window_info_description}
                learn_more_url="https://astermail.org/terms#section-9"
                title={t("common.inactivity_window_info_title")}
              />
            </span>
          }
          trailing={
            <Select
              disabled={saving_inactivity}
              value={String(inactivity_window)}
              onValueChange={(v) => request_inactivity_window_change(Number(v))}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 6, 9, 12, 18, 24].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t("common.inactivity_window_months").replace(
                      "{{n}}",
                      String(m),
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </IslandSection>

      <IslandSection>
        <IslandRow
          description={t("common.restore_defaults_description")}
          label={t("common.reset_all_settings")}
          trailing={
            <Button
              size="md"
              variant="secondary"
              onClick={() => set_show_reset_confirm(true)}
            >
              {t("settings.reset")}
            </Button>
          }
        />
      </IslandSection>

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
          if (step_up_mode === "inactivity")
            set_pending_inactivity_months(null);
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
    </IslandSections>
  );
}
