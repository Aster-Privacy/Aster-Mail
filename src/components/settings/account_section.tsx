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
import type { Badge } from "@/services/api/user";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CameraIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  StarIcon,
  ShieldCheckIcon,
  CheckBadgeIcon,
  SparklesIcon,
} from "@heroicons/react/20/solid";
import { Button } from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
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
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  update_display_name,
  update_profile_picture,
  update_profile_color,
  fetch_my_badges,
} from "@/services/api/user";
import {
  get_recovery_email,
  save_recovery_email,
  resend_recovery_verification,
  remove_recovery_email,
} from "@/services/api/recovery_email";
import {
  derive_kek_from_password,
  serialize_kek_for_vault,
  prepend_kek_to_list,
} from "@/services/crypto/legacy_keks";
import {
  get_vault_from_memory,
  get_passphrase_from_memory,
  store_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import { encrypt_vault } from "@/services/crypto/key_manager";
import { api_client } from "@/services/api/client";

const MAX_SIZE = 256;

function compress_image(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > height && width > MAX_SIZE) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
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
}

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

export function AccountSection() {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { user, update_user, vault } = use_auth();
  const { preferences, update_preference, reset_to_defaults } =
    use_preferences();
  const file_ref = useRef<HTMLInputElement>(null);

  const [color, set_color] = useState(
    preferences.profile_color || PROFILE_COLORS[5],
  );
  const [name, set_name] = useState(user?.display_name || user?.username || "");
  const [saving_name, set_saving_name] = useState(false);
  const [uploading, set_uploading] = useState(false);
  const [preview, set_preview] = useState<string | null>(null);
  const [recovery, set_recovery] = useState<{
    email: string | null;
    verified: boolean;
  }>({ email: null, verified: false });
  const [show_modal, set_show_modal] = useState(false);
  const [pending, set_pending] = useState(false);
  const [resending, set_resending] = useState(false);
  const [show_reset_confirm, set_show_reset_confirm] = useState(false);
  const [show_remove_recovery_confirm, set_show_remove_recovery_confirm] =
    useState(false);
  const [removing_recovery, set_removing_recovery] = useState(false);
  const [photo_error, set_photo_error] = useState<string | null>(null);
  const [badges, set_badges] = useState<Badge[]>([]);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [show_vault_recovery, set_show_vault_recovery] = useState(false);
  const [vault_recovery_password, set_vault_recovery_password] = useState("");
  const [vault_recovery_loading, set_vault_recovery_loading] = useState(false);
  const [vault_recovery_error, set_vault_recovery_error] = useState("");
  const [vault_recovery_success, set_vault_recovery_success] = useState(false);
  const [show_recovery_password, set_show_recovery_password] = useState(false);

  const needs_vault_recovery = user?.email === "timo@astermail.org";

  useEffect(() => {
    const run = async () => {
      try {
        const [badges_response, recovery_response] = await Promise.all([
          fetch_my_badges(),
          vault
            ? get_recovery_email(vault).catch(() => ({
                data: { email: null, verified: false },
              }))
            : Promise.resolve({ data: { email: null, verified: false } }),
        ]);

        if (badges_response.data) set_badges(badges_response.data);
        if (recovery_response.data) set_recovery(recovery_response.data);
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
      } finally {
        set_is_initial_load(false);
      }
    };

    run();
  }, [vault]);

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

  const handle_photo = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const compressed = await compress_image(file);

      set_preview(compressed);

      const response = await update_profile_picture(compressed);

      if (response.error) {
        set_photo_error(response.error);
        set_preview(null);
      } else if (response.data?.success && user) {
        await update_user({
          ...user,
          profile_picture: compressed,
        });
        set_preview(null);
        set_photo_error(null);
        show_toast(t("common.profile_picture_updated"), "success");
      } else {
        set_photo_error(t("common.failed_save_profile_picture"));
        set_preview(null);
      }
    } catch (err) {
      set_preview(null);
      set_photo_error(
        err instanceof Error ? err.message : t("common.failed_upload_image"),
      );
    } finally {
      set_uploading(false);
      if (file_ref.current) {
        file_ref.current.value = "";
      }
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
      set_pending(true);
    } else throw new Error("Failed");
  };

  const handle_remove_recovery = async () => {
    if (removing_recovery) return;
    set_removing_recovery(true);
    try {
      const r = await remove_recovery_email();

      if (r.data.success) {
        set_recovery({ email: null, verified: false });
        set_pending(false);
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

  const handle_vault_recovery = async () => {
    set_vault_recovery_error("");
    set_vault_recovery_success(false);

    if (!vault_recovery_password) {
      set_vault_recovery_error(t("settings.vault_recovery_enter_password"));

      return;
    }

    if (!user?.id) {
      set_vault_recovery_error(t("settings.user_not_found"));

      return;
    }

    set_vault_recovery_loading(true);

    try {
      const current_vault = get_vault_from_memory();
      const current_passphrase = get_passphrase_from_memory();

      if (!current_vault || !current_passphrase) {
        set_vault_recovery_error(t("settings.session_expired_sign_in"));
        set_vault_recovery_loading(false);

        return;
      }

      const old_kek_raw = await derive_kek_from_password(vault_recovery_password);

      current_vault.legacy_keks = prepend_kek_to_list(
        current_vault.legacy_keks,
        serialize_kek_for_vault(old_kek_raw),
      );

      const {
        encrypted_vault: new_encrypted_vault,
        vault_nonce: new_vault_nonce,
      } = await encrypt_vault(current_vault, current_passphrase);

      const response = await api_client.put<{ success: boolean }>(
        "/crypto/v1/keys/vault",
        {
          encrypted_vault: new_encrypted_vault,
          vault_nonce: new_vault_nonce,
        },
      );

      if (response.error) {
        set_vault_recovery_error(response.error);
        set_vault_recovery_loading(false);

        return;
      }

      try {
        localStorage.setItem(
          `astermail_encrypted_vault_${user.id}`,
          new_encrypted_vault,
        );
        localStorage.setItem(
          `astermail_vault_nonce_${user.id}`,
          new_vault_nonce,
        );
      } catch {}

      await store_vault_in_memory(current_vault, current_passphrase);

      set_vault_recovery_success(true);
      set_vault_recovery_password("");
    } catch (err) {
      set_vault_recovery_error(
        err instanceof Error
          ? err.message
          : t("settings.vault_recovery_failed"),
      );
    } finally {
      set_vault_recovery_loading(false);
    }
  };

  const has_custom_picture = !!(preview || user?.profile_picture);
  const picture = preview || user?.profile_picture || "/profile.webp";

  if (is_initial_load) {
    return <SettingsSkeleton variant="profile" />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl overflow-hidden bg-surf-tertiary border border-edge-secondary">
        <div
          className="h-20"
          style={{
            backgroundColor: color,
          }}
        />
        <div className="px-5 pb-5 -mt-8 flex items-end justify-between">
          <div className="relative">
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg relative bg-surf-primary">
              {has_custom_picture ? (
                <img
                  alt=""
                  className="w-full h-full object-cover rounded-xl border-[3px] border-surf-primary"
                  src={picture}
                />
              ) : (
                <div
                  className="w-full h-full rounded-xl flex items-center justify-center"
                  style={{
                    background: get_gradient_background(color),
                    boxShadow:
                      "inset 0 -3px 8px rgba(0,0,0,0.25), inset 0 1px 3px rgba(255,255,255,0.2)",
                  }}
                >
                  <img
                    alt=""
                    draggable={false}
                    src="/aster.webp"
                    style={{
                      width: 35,
                      height: 35,
                      filter: "brightness(0) invert(1)",
                      objectFit: "contain" as const,
                      pointerEvents: "none" as const,
                    }}
                  />
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
              disabled={uploading}
              onClick={() => file_ref.current?.click()}
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
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              type="file"
              onChange={handle_photo}
            />
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

      {badges.length > 0 && (
        <div className="flex items-center justify-between py-4">
          <div>
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.badges_title")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.badges_description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {badges.map((badge) => {
              const BadgeIcon =
                badge.icon === "shield"
                  ? ShieldCheckIcon
                  : badge.icon === "check"
                    ? CheckBadgeIcon
                    : badge.icon === "sparkles"
                      ? SparklesIcon
                      : StarIcon;

              return (
                <span
                  key={badge.slug}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors"
                  style={{
                    color: badge.color,
                    borderColor: `${badge.color}40`,
                    backgroundColor: `${badge.color}15`,
                  }}
                  title={badge.description || undefined}
                >
                  <BadgeIcon className="w-3 h-3 flex-shrink-0" />
                  {badge.display_name}
                </span>
              );
            })}
          </div>
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
                disabled={removing_recovery}
                variant="ghost"
                onClick={() => set_show_remove_recovery_confirm(true)}
              >
                {removing_recovery ? <Spinner size="md" /> : t("common.remove")}
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

      {needs_vault_recovery && (
        <div className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-txt-primary flex items-center gap-2">
                <ArrowPathIcon className="w-4 h-4 flex-shrink-0" />
                {t("settings.vault_recovery_title")}
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.vault_recovery_description")}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => set_show_vault_recovery(true)}
            >
              {t("settings.vault_recovery_button")}
            </Button>
          </div>
        </div>
      )}

      <Modal
        is_open={show_vault_recovery}
        on_close={() => {
          set_show_vault_recovery(false);
          set_vault_recovery_password("");
          set_vault_recovery_error("");
          set_vault_recovery_success(false);
          set_show_recovery_password(false);
        }}
        size="sm"
        z_index={70}
      >
        <ModalHeader>
          <ModalTitle>{t("settings.vault_recovery_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.vault_recovery_modal_description")}
          </ModalDescription>
        </ModalHeader>

        <ModalBody>
          <div className="space-y-4">
            <div>
              <label
                className="text-sm font-medium block mb-2 text-txt-primary"
                htmlFor="recovery-old-password"
              >
                {t("settings.vault_recovery_old_password_label")}
              </label>
              <div className="relative">
                <Input
                  className="pr-10"
                  disabled={vault_recovery_loading}
                  id="recovery-old-password"
                  placeholder={t("settings.vault_recovery_old_password_placeholder")}
                  type={show_recovery_password ? "text" : "password"}
                  value={vault_recovery_password}
                  onChange={(e) => set_vault_recovery_password(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && vault_recovery_password) {
                      handle_vault_recovery();
                    }
                  }}
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-txt-muted"
                  type="button"
                  onClick={() => set_show_recovery_password(!show_recovery_password)}
                >
                  {show_recovery_password ? (
                    <EyeSlashIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {vault_recovery_error && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{ backgroundColor: "#dc2626", color: "#fff" }}
              >
                <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0" />
                <span>{vault_recovery_error}</span>
              </div>
            )}

            {vault_recovery_success && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg text-sm"
                style={{ backgroundColor: "#16a34a", color: "#fff" }}
              >
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                <span>{t("settings.vault_recovery_success")}</span>
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            disabled={vault_recovery_loading}
            variant="outline"
            onClick={() => {
              set_show_vault_recovery(false);
              set_vault_recovery_password("");
              set_vault_recovery_error("");
              set_vault_recovery_success(false);
              set_show_recovery_password(false);
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={vault_recovery_loading || !vault_recovery_password || vault_recovery_success}
            variant="depth"
            onClick={handle_vault_recovery}
          >
            {vault_recovery_loading
              ? t("settings.vault_recovery_recovering")
              : t("settings.vault_recovery_recover_button")}
          </Button>
        </ModalFooter>
      </Modal>

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

      <RecoveryModal
        current={recovery.email}
        is_open={show_modal}
        on_close={() => set_show_modal(false)}
        on_save={save_recovery}
      />
    </div>
  );
}
