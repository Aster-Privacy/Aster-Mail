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
import { useState, useCallback, useRef } from "react";
import { CheckIcon, PencilIcon } from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader } from "./shared";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Spinner } from "@/components/ui/spinner";
import { PROFILE_COLORS } from "@/constants/profile";
import { Input } from "@/components/ui/input";

export function AccountSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { user, update_user } = use_auth();
  const { preferences, update_preference } = use_preferences();
  const file_ref = useRef<HTMLInputElement>(null);
  const [uploading, set_uploading] = useState(false);
  const [photo_error, set_photo_error] = useState<string | null>(null);
  const [preview, set_preview] = useState<string | null>(null);
  const [display_name, set_display_name] = useState(
    user?.display_name || user?.username || "",
  );
  const [saving_name, set_saving_name] = useState(false);

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

                  update_preference("profile_color", color);
                  if (user) {
                    await update_user({ ...user, profile_color: color });
                  }
                  const { update_profile_color } = await import(
                    "@/services/api/user"
                  );
                  const response = await update_profile_color(color);

                  if (response.error) {
                    update_preference("profile_color", prev);
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
      </div>
    </div>
  );
}
