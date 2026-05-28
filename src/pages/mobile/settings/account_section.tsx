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

import { useEffect, useState, useCallback, useRef } from "react";
import {
  CheckIcon,
  PencilIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader, SettingsRow } from "./shared";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Spinner } from "@/components/ui/spinner";
import { PROFILE_COLORS } from "@/constants/profile";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Button, Switch } from "@aster/ui";
import {
  fetch_my_badges,
  fetch_badge_preferences,
  update_badge_preferences,
} from "@/services/api/user";
import { get_badge_visual } from "@/components/ui/badge_registry";
import { set_my_badge_prefs } from "@/stores/my_badge_prefs_store";
import {
  get_recovery_email,
  save_recovery_email,
  resend_recovery_verification,
  remove_recovery_email,
} from "@/services/api/recovery_email";

function mask_email(email: string): string {
  const [local, domain] = email.split("@");

  if (!domain) return email;
  const masked_local = local.length > 0 ? local[0] + "***" : "***";

  return `${masked_local}@${domain}`;
}

function RecoveryModal({
  is_open,
  on_close,
  on_save,
  current,
}: {
  is_open: boolean;
  on_close: () => void;
  on_save: (email: string) => Promise<void>;
  current: string | null;
}) {
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
      set_error(err instanceof Error ? err.message : t("common.failed_to_save"));
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
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button disabled={saving} onClick={handle_save}>
          {saving ? (
            <>
              <Spinner className="mr-2" size="md" />
              {t("common.saving")}
            </>
          ) : (
            t("common.save")
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function AccountSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { user, update_user, vault } = use_auth();
  const { preferences, update_preference, reset_to_defaults } =
    use_preferences();
  const file_ref = useRef<HTMLInputElement>(null);
  const [uploading, set_uploading] = useState(false);
  const [photo_error, set_photo_error] = useState<string | null>(null);
  const [preview, set_preview] = useState<string | null>(null);
  const [display_name, set_display_name] = useState(
    user?.display_name || user?.username || "",
  );
  const [saving_name, set_saving_name] = useState(false);
  const [badges, set_badges] = useState<Badge[]>([]);
  const [badge_prefs, set_badge_prefs] = useState<BadgePreferences | null>(null);
  const [is_badge_saving, set_is_badge_saving] = useState(false);
  const [recovery, set_recovery] = useState<{
    email: string | null;
    verified: boolean;
  }>({ email: null, verified: false });
  const [show_recovery_modal, set_show_recovery_modal] = useState(false);
  const [resending, set_resending] = useState(false);
  const [removing_recovery, set_removing_recovery] = useState(false);
  const [show_remove_recovery_confirm, set_show_remove_recovery_confirm] =
    useState(false);
  const [show_reset_confirm, set_show_reset_confirm] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const [badges_response, prefs_response, recovery_response] =
          await Promise.all([
            fetch_my_badges(),
            fetch_badge_preferences(),
            vault
              ? get_recovery_email(vault).catch(() => ({
                  data: { email: null, verified: false },
                }))
              : Promise.resolve({ data: { email: null, verified: false } }),
          ]);

        if (badges_response.data) set_badges(badges_response.data);
        if (prefs_response.data) {
          set_badge_prefs(prefs_response.data);
          set_my_badge_prefs(prefs_response.data);
        }
        if (recovery_response.data) set_recovery(recovery_response.data);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
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
    set_is_badge_saving(true);
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
    } finally {
      set_is_badge_saving(false);
    }
  };

  const save_recovery = async (email: string) => {
    if (!vault) return;
    const r = await save_recovery_email(email, vault);

    if (r.code === "CONFLICT") {
      throw new Error(t("common.recovery_conflict"));
    }
    if (r.data.success) {
      set_recovery({ email, verified: false });
    } else throw new Error("Failed");
  };

  const handle_resend = async () => {
    if (resending) return;
    set_resending(true);
    try {
      const r = await resend_recovery_verification();

      if (r.data.success) {
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

  const handle_remove_recovery = async () => {
    if (removing_recovery) return;
    set_removing_recovery(true);
    try {
      const r = await remove_recovery_email();

      if (r.data.success) {
        set_recovery({ email: null, verified: false });
        show_toast(t("common.recovery_email_removed"), "success");
      } else {
        show_toast(t("common.failed_remove_recovery_email"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("common.failed_remove_recovery_email"), "error");
    } finally {
      set_removing_recovery(false);
      set_show_remove_recovery_confirm(false);
    }
  };

  const handle_photo = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        set_photo_error(t("common.valid_image_error"));

        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        set_photo_error(t("common.image_size_error"));

        return;
      }
      set_uploading(true);
      set_photo_error(null);
      try {
        const { update_profile_picture } = await import("@/services/api/user");
        const img = new Image();
        const url = URL.createObjectURL(file);
        const compressed = await new Promise<string>((resolve, reject) => {
          img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement("canvas");
            let { width, height } = img;
            const max = 256;

            if (width > height && width > max) {
              height = Math.round((height * max) / width);
              width = max;
            } else if (height > max) {
              width = Math.round((width * max) / height);
              height = max;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL("image/webp", 0.8));
            } else reject(new Error("No canvas context"));
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Load failed"));
          };
          img.src = url;
        });

        set_preview(compressed);
        const response = await update_profile_picture(compressed);

        if (response.error) {
          set_photo_error(response.error);
          set_preview(null);
        } else if (response.data?.success && user) {
          await update_user({ ...user, profile_picture: compressed });
          set_photo_error(null);
        } else {
          set_photo_error(t("common.failed_save_profile_picture"));
          set_preview(null);
        }
      } catch {
        set_photo_error(t("common.failed_upload_image"));
        set_preview(null);
      } finally {
        set_uploading(false);
        if (file_ref.current) file_ref.current.value = "";
      }
    },
    [user, update_user, t],
  );

  const handle_save_name = useCallback(async () => {
    const trimmed = display_name.trim();

    if (!trimmed || !user || trimmed === (user.display_name || user.username))
      return;
    set_saving_name(true);
    try {
      const { update_display_name } = await import("@/services/api/user");
      const r = await update_display_name(trimmed);

      if (r.data?.user)
        await update_user({
          ...user,
          display_name: r.data.user.display_name || undefined,
        });
    } catch {}
    set_saving_name(false);
  }, [display_name, user, update_user]);

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.account")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="flex flex-col items-center gap-3 px-4 py-6">
          <button
            className="relative"
            disabled={uploading}
            type="button"
            onClick={() => file_ref.current?.click()}
          >
            <ProfileAvatar
              use_domain_logo
              email={user?.email ?? ""}
              image_url={preview || user?.profile_picture}
              name={user?.display_name ?? user?.username ?? ""}
              profile_color={preferences.profile_color}
              size="xl"
            />
            <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--bg-primary)] bg-[var(--accent-color,#3b82f6)] text-white">
              {uploading ? (
                <Spinner size="xs" />
              ) : (
                <PencilIcon className="h-3.5 w-3.5" />
              )}
            </span>
            <input
              ref={file_ref}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              type="file"
              onChange={handle_photo}
            />
          </button>
          {photo_error && (
            <p className="text-[12px] text-red-500">{photo_error}</p>
          )}
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">
            {user?.display_name ?? user?.username ?? ""}
          </p>
          <p className="text-[13px] text-[var(--text-muted)]">
            {user?.email ?? ""}
          </p>
        </div>

        <SettingsGroup title={t("auth.display_name_optional")}>
          <div className="flex items-center gap-2 px-4 py-3">
            <Input
              className="min-w-0 flex-1 bg-transparent"
              value={display_name}
              onBlur={handle_save_name}
              onChange={(e) => set_display_name(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handle_save_name();
              }}
            />
            {saving_name && <Spinner size="xs" />}
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("auth.profile_color")}>
          <div className="flex flex-wrap gap-2.5 px-4 py-4">
            {PROFILE_COLORS.map((color) => (
              <button
                key={color}
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{
                  backgroundColor: color,
                  boxShadow:
                    preferences.profile_color === color
                      ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${color}`
                      : "none",
                }}
                type="button"
                onClick={async () => {
                  const prev = preferences.profile_color;

                  update_preference("profile_color", color, true);
                  if (user) {
                    await update_user({ ...user, profile_color: color });
                  }
                  const { update_profile_color } = await import(
                    "@/services/api/user"
                  );
                  const response = await update_profile_color(color);

                  if (response.error) {
                    update_preference("profile_color", prev, true);
                    if (user) {
                      await update_user({
                        ...user,
                        profile_color: prev || undefined,
                      });
                    }
                  }
                }}
              >
                {preferences.profile_color === color && (
                  <CheckIcon
                    className="h-4.5 w-4.5 text-white"
                    strokeWidth={2.5}
                  />
                )}
              </button>
            ))}
          </div>
        </SettingsGroup>

        {badges.length > 0 && badge_prefs && (
          <SettingsGroup title={t("badges.active_badge")}>
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {badges.map((badge) => {
                const visual = get_badge_visual(badge.slug);
                const Icon = visual.icon;
                const is_active = badge_prefs.active_badge_slug === badge.slug;

                return (
                  <button
                    key={badge.slug}
                    className={cn(
                      "inline-flex select-none items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-xs font-medium",
                      is_active
                        ? "bg-[var(--accent-blue)] text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]",
                    )}
                    disabled={is_badge_saving}
                    type="button"
                    onClick={() =>
                      persist_badge_prefs({
                        active_badge_slug: is_active ? null : badge.slug,
                      })
                    }
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{badge.display_name}</span>
                    {badge.find_order != null && (
                      <span className="tabular-nums opacity-80">
                        #{badge.find_order.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <SettingsRow
              label={t("badges.show_on_profile")}
              trailing={
                <Switch
                  checked={badge_prefs.show_badge_profile}
                  disabled={is_badge_saving || !badge_prefs.active_badge_slug}
                  onCheckedChange={(v) =>
                    persist_badge_prefs({ show_badge_profile: v })
                  }
                />
              }
            />
            <SettingsRow
              label={t("badges.show_avatar_ring")}
              trailing={
                <Switch
                  checked={badge_prefs.show_badge_ring}
                  disabled={is_badge_saving || !badge_prefs.active_badge_slug}
                  onCheckedChange={(v) =>
                    persist_badge_prefs({ show_badge_ring: v })
                  }
                />
              }
            />
            <SettingsRow
              label={t("badges.show_in_signature")}
              trailing={
                <Switch
                  checked={badge_prefs.show_badge_signature}
                  disabled={is_badge_saving || !badge_prefs.active_badge_slug}
                  onCheckedChange={(v) =>
                    persist_badge_prefs({ show_badge_signature: v })
                  }
                />
              }
            />
          </SettingsGroup>
        )}

        <SettingsGroup title={t("common.recovery_email")}>
          {recovery.email && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[14px] text-[var(--text-secondary)]">
                {mask_email(recovery.email)}
              </span>
              {recovery.verified ? (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircleIcon className="h-4 w-4" />
                  {t("common.verified")}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <ExclamationCircleIcon className="h-4 w-4" />
                  {t("common.not_verified")}
                </span>
              )}
            </div>
          )}
          <SettingsRow
            label={recovery.email ? t("common.update") : t("common.add")}
            on_press={() => set_show_recovery_modal(true)}
          />
          {recovery.email && !recovery.verified && (
            <SettingsRow
              label={t("common.resend")}
              on_press={handle_resend}
              trailing={resending ? <Spinner size="xs" /> : undefined}
            />
          )}
          {recovery.email && (
            <SettingsRow
              destructive
              label={t("common.remove")}
              on_press={() => set_show_remove_recovery_confirm(true)}
              trailing={removing_recovery ? <Spinner size="xs" /> : undefined}
            />
          )}
        </SettingsGroup>

        <SettingsGroup title={t("common.reset_all_settings")}>
          <SettingsRow
            destructive
            label={t("settings.reset")}
            on_press={() => set_show_reset_confirm(true)}
          />
        </SettingsGroup>
      </div>

      <RecoveryModal
        current={recovery.email}
        is_open={show_recovery_modal}
        on_close={() => set_show_recovery_modal(false)}
        on_save={save_recovery}
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.remove")}
        is_open={show_remove_recovery_confirm}
        message={t("common.remove_recovery_email_confirm")}
        on_cancel={() => set_show_remove_recovery_confirm(false)}
        on_confirm={handle_remove_recovery}
        title={t("common.remove_recovery_email")}
        variant="danger"
      />

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
    </div>
  );
}
