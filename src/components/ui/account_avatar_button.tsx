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
import { CameraIcon } from "@heroicons/react/24/solid";

import {
  PROFILE_PICTURE_ACCEPT,
  use_profile_picture_upload,
} from "@/hooks/use_profile_picture_upload";
import { use_i18n } from "@/lib/i18n/context";

import { ProfileAvatar } from "./profile_avatar";

interface AccountAvatarButtonProps {
  name: string;
  email?: string;
  image_url?: string;
  profile_color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  is_paid_plan?: boolean;
  ring_offset_color?: string;
  className?: string;
}

const OVERLAY_ICON_SIZE: Record<string, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
  xl: "w-7 h-7",
};

export function AccountAvatarButton({
  name,
  email,
  image_url,
  profile_color,
  size = "lg",
  is_paid_plan = false,
  ring_offset_color = "var(--bg-hover)",
  className = "",
}: AccountAvatarButtonProps) {
  const { t } = use_i18n();
  const { file_ref, uploading, preview, open_picker, handle_file } =
    use_profile_picture_upload();

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <input
        ref={file_ref}
        accept={PROFILE_PICTURE_ACCEPT}
        className="hidden"
        type="file"
        onChange={handle_file}
      />
      <button
        aria-label={t("auth.change_photo")}
        className="group relative flex w-fit rounded-full leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2"
        disabled={uploading}
        style={{ ["--tw-ring-offset-color" as string]: ring_offset_color }}
        title={t("auth.change_photo")}
        type="button"
        onClick={open_picker}
      >
        <span className={is_paid_plan ? "plan_ring" : "inline-flex leading-none"}>
          <span className="relative flex rounded-full leading-none">
            <ProfileAvatar
              email={email}
              image_url={preview || image_url}
              name={name}
              profile_color={profile_color}
              size={size}
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 motion-reduce:transition-none"
              style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
            >
              <CameraIcon className={`${OVERLAY_ICON_SIZE[size]} text-white`} />
            </span>
            {uploading && (
              <span
                className="absolute inset-0 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(0, 0, 0, 0.55)" }}
              >
                <span
                  className="rounded-full border-2 border-white border-t-transparent animate-spin motion-reduce:animate-none"
                  style={{ width: "50%", height: "50%" }}
                />
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}
