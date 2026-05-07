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

import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";
import type { TranslationKey } from "@/lib/i18n/types";

import { useMemo, useRef, useState } from "react";
import {
  TrashIcon,
  ClipboardDocumentIcon,
  AtSymbolIcon,
  GlobeAltIcon,
  BoltIcon,
  CameraIcon,
  XMarkIcon,
  LockClosedIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Switch } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";
import { update_alias } from "@/services/api/aliases";
import { update_domain_address } from "@/services/api/domains";
import { AliasDisplayNameEditor } from "@/components/settings/aliases/alias_display_name_editor";

const AVATAR_MAX_SIZE = 256;

function compress_avatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > height && width > AVATAR_MAX_SIZE) {
        height = Math.round((height * AVATAR_MAX_SIZE) / width);
        width = AVATAR_MAX_SIZE;
      } else if (height > AVATAR_MAX_SIZE) {
        width = Math.round((width * AVATAR_MAX_SIZE) / height);
        height = AVATAR_MAX_SIZE;
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

function get_alias_color(address: string): string {
  let hash = 0;

  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }

  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

function AliasAvatar({
  profile_picture,
  gradient,
  icon,
  is_locked,
  uploading,
  on_file_select,
  on_remove,
}: {
  profile_picture?: string;
  gradient: string;
  icon: React.ReactNode;
  is_locked: boolean;
  uploading: boolean;
  on_file_select: (file: File) => void;
  on_remove: () => void;
}) {
  const { t } = use_i18n();
  const file_ref = useRef<HTMLInputElement>(null);

  const handle_file_change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) on_file_select(file);
    if (file_ref.current) file_ref.current.value = "";
  };

  return (
    <div className="relative group flex-shrink-0">
      {profile_picture ? (
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
          <img
            alt=""
            className="w-full h-full object-cover"
            src={profile_picture}
          />
        </div>
      ) : (
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: gradient,
            boxShadow:
              "inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.15)",
          }}
        >
          {icon}
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
          <Spinner className="text-white" size="xs" />
        </div>
      )}
      <div className="absolute -bottom-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
        {is_locked ? (
          <div
            className="p-1 rounded-full bg-surf-card border border-edge-secondary"
            title={t("common.alias_avatars_locked" as TranslationKey)}
          >
            <LockClosedIcon className="w-2.5 h-2.5 text-txt-muted" />
          </div>
        ) : (
          <>
            <button
              className="p-1 rounded-full bg-surf-card border border-edge-secondary cursor-pointer hover:bg-surf-hover transition-colors"
              title={t("common.change_alias_avatar" as TranslationKey)}
              type="button"
              onClick={() => file_ref.current?.click()}
            >
              <CameraIcon className="w-2.5 h-2.5 text-txt-muted" />
            </button>
            {profile_picture && (
              <button
                className="p-1 rounded-full bg-surf-card border border-edge-secondary cursor-pointer hover:border-red-500/30 hover:text-red-600 transition-colors"
                title={t("common.remove_alias_avatar" as TranslationKey)}
                type="button"
                onClick={on_remove}
              >
                <XMarkIcon className="w-2.5 h-2.5 text-red-500" />
              </button>
            )}
          </>
        )}
      </div>
      <input
        ref={file_ref}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        type="file"
        onChange={handle_file_change}
      />
    </div>
  );
}

function get_grace_days_remaining(expires_at: string): number {
  const now = new Date();
  const expires = new Date(expires_at);
  const diff = expires.getTime() - now.getTime();

  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

interface AliasItemProps {
  alias: DecryptedEmailAlias;
  on_toggle: (id: string, enabled: boolean) => void;
  on_delete: (id: string) => void;
  on_avatar_changed?: () => void;
  on_display_name_saved?: (alias_id: string, name: string) => void;
  toggling: boolean;
  deleting: boolean;
  is_avatar_locked: boolean;
}

export function AliasItem({
  alias,
  on_toggle,
  on_delete,
  on_avatar_changed,
  on_display_name_saved,
  toggling,
  deleting,
  is_avatar_locked,
}: AliasItemProps) {
  const { t } = use_i18n();
  const [uploading, set_uploading] = useState(false);
  const [local_picture, set_local_picture] = useState<string | undefined>(
    undefined,
  );
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(alias.full_address)),
    [alias.full_address],
  );

  const in_grace_period = !!alias.downgrade_grace_expires_at;
  const grace_days = in_grace_period
    ? get_grace_days_remaining(alias.downgrade_grace_expires_at!)
    : 0;

  const displayed_picture =
    local_picture !== undefined
      ? local_picture || undefined
      : alias.profile_picture;

  const handle_file_select = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      show_toast(t("common.valid_image_error"), "error");

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      show_toast(t("common.image_size_error"), "error");

      return;
    }

    set_uploading(true);
    try {
      const compressed = await compress_avatar(file);

      set_local_picture(compressed);
      const response = await update_alias(alias.id, {
        profile_picture: compressed,
      });

      if (response.error) {
        set_local_picture(undefined);
        show_toast(
          t("common.failed_update_alias_avatar" as TranslationKey),
          "error",
        );
      } else {
        show_toast(
          t("common.alias_avatar_updated" as TranslationKey),
          "success",
        );
        on_avatar_changed?.();
      }
    } catch {
      set_local_picture(undefined);
      show_toast(
        t("common.failed_update_alias_avatar" as TranslationKey),
        "error",
      );
    } finally {
      set_uploading(false);
    }
  };

  const handle_remove = async () => {
    set_uploading(true);
    try {
      set_local_picture("");
      const response = await update_alias(alias.id, {
        profile_picture: null,
      });

      if (response.error) {
        set_local_picture(undefined);
        show_toast(
          t("common.failed_update_alias_avatar" as TranslationKey),
          "error",
        );
      } else {
        show_toast(
          t("common.alias_avatar_removed" as TranslationKey),
          "success",
        );
        on_avatar_changed?.();
      }
    } catch {
      set_local_picture(undefined);
      show_toast(
        t("common.failed_update_alias_avatar" as TranslationKey),
        "error",
      );
    } finally {
      set_uploading(false);
    }
  };

  const copy_address = async () => {
    try {
      await navigator.clipboard.writeText(alias.full_address);
      show_toast(t("settings.alias_copied"), "success");
    } catch {}
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl transition-all bg-surf-secondary border border-edge-secondary"
      style={{
        opacity: alias.is_enabled && !in_grace_period ? 1 : 0.5,
      }}
    >
      <AliasAvatar
        gradient={gradient}
        icon={
          alias.is_random ? (
            <BoltIcon className="w-5 h-5 text-white" />
          ) : (
            <AtSymbolIcon className="w-5 h-5 text-white" />
          )
        }
        is_locked={is_avatar_locked}
        on_file_select={handle_file_select}
        on_remove={handle_remove}
        profile_picture={displayed_picture}
        uploading={uploading}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate text-txt-primary">
            {alias.full_address}
          </p>
          {alias.is_random && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surf-tertiary text-txt-muted">
              {t("common.random")}
            </span>
          )}
          {in_grace_period && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <ClockIcon className="w-3 h-3" />
              {t("settings.alias_grace_days" as TranslationKey, {
                days: String(grace_days),
              })}
            </span>
          )}
        </div>
        <AliasDisplayNameEditor
          alias_address={alias.full_address}
          alias_id={alias.id}
          display_name={alias.display_name}
          on_saved={(name) => on_display_name_saved?.(alias.id, name)}
        />
        {in_grace_period && (
          <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-400">
            {t("settings.alias_grace_upgrade_hint" as TranslationKey)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          className="h-8 w-8"
          size="icon"
          title={t("common.copy_address")}
          variant="ghost"
          onClick={copy_address}
        >
          <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted" />
        </Button>

        <Switch
          checked={alias.is_enabled}
          disabled={toggling || in_grace_period}
          onCheckedChange={(checked) => on_toggle(alias.id, checked)}
        />

        <Button
          className="h-8 w-8 text-red-500 hover:text-red-500 hover:bg-red-500/10"
          disabled={deleting}
          size="icon"
          variant="ghost"
          onClick={() => on_delete(alias.id)}
        >
          {deleting ? <Spinner size="md" /> : <TrashIcon className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

interface DomainAddressItemProps {
  address: DecryptedDomainAddress & { domain_name: string };
  on_delete: (id: string, domain_id: string) => void;
  on_avatar_changed?: () => void;
  deleting: boolean;
  is_avatar_locked: boolean;
}

export function DomainAddressItem({
  address,
  on_delete,
  on_avatar_changed,
  deleting,
  is_avatar_locked,
}: DomainAddressItemProps) {
  const { t } = use_i18n();
  const [uploading, set_uploading] = useState(false);
  const [local_picture, set_local_picture] = useState<string | undefined>(
    undefined,
  );
  const full_address = `${address.local_part}@${address.domain_name}`;
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(full_address)),
    [full_address],
  );

  const displayed_picture =
    local_picture !== undefined
      ? local_picture || undefined
      : address.profile_picture;

  const handle_file_select = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      show_toast(t("common.valid_image_error"), "error");

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      show_toast(t("common.image_size_error"), "error");

      return;
    }

    set_uploading(true);
    try {
      const compressed = await compress_avatar(file);

      set_local_picture(compressed);
      const response = await update_domain_address(
        address.domain_id,
        address.id,
        { profile_picture: compressed },
      );

      if (response.error) {
        set_local_picture(undefined);
        show_toast(
          t("common.failed_update_alias_avatar" as TranslationKey),
          "error",
        );
      } else {
        show_toast(
          t("common.alias_avatar_updated" as TranslationKey),
          "success",
        );
        on_avatar_changed?.();
      }
    } catch {
      set_local_picture(undefined);
      show_toast(
        t("common.failed_update_alias_avatar" as TranslationKey),
        "error",
      );
    } finally {
      set_uploading(false);
    }
  };

  const handle_remove = async () => {
    set_uploading(true);
    try {
      set_local_picture("");
      const response = await update_domain_address(
        address.domain_id,
        address.id,
        { profile_picture: null },
      );

      if (response.error) {
        set_local_picture(undefined);
        show_toast(
          t("common.failed_update_alias_avatar" as TranslationKey),
          "error",
        );
      } else {
        show_toast(
          t("common.alias_avatar_removed" as TranslationKey),
          "success",
        );
        on_avatar_changed?.();
      }
    } catch {
      set_local_picture(undefined);
      show_toast(
        t("common.failed_update_alias_avatar" as TranslationKey),
        "error",
      );
    } finally {
      set_uploading(false);
    }
  };

  const copy_address = async () => {
    try {
      await navigator.clipboard.writeText(full_address);
      show_toast(t("settings.address_copied"), "success");
    } catch {}
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl transition-all bg-surf-secondary border border-edge-secondary">
      <AliasAvatar
        gradient={gradient}
        icon={<GlobeAltIcon className="w-5 h-5 text-white" />}
        is_locked={is_avatar_locked}
        on_file_select={handle_file_select}
        on_remove={handle_remove}
        profile_picture={displayed_picture}
        uploading={uploading}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate text-txt-primary">
            {full_address}
          </p>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-surf-tertiary text-txt-muted">
            {t("common.custom")}
          </span>
        </div>
        {address.display_name && (
          <p className="text-xs mt-0.5 text-txt-muted">
            {address.display_name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          className="h-8 w-8"
          size="icon"
          title={t("common.copy_address")}
          variant="ghost"
          onClick={copy_address}
        >
          <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted" />
        </Button>

        <Button
          className="h-8 w-8 text-red-500 hover:text-red-500 hover:bg-red-500/10"
          disabled={deleting}
          size="icon"
          variant="ghost"
          onClick={() => on_delete(address.id, address.domain_id)}
        >
          {deleting ? <Spinner size="md" /> : <TrashIcon className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
