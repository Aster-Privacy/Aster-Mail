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
import { AccountAvatarButtonView } from "@aster/ui";

import { ProfileAvatar } from "./profile_avatar";

import { show_toast } from "@/components/toast/simple_toast";
import {
  PROFILE_PICTURE_ACCEPT,
  use_profile_picture_upload,
} from "@/hooks/use_profile_picture_upload";
import { use_i18n } from "@/lib/i18n/context";

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
    use_profile_picture_upload({
      on_error: (message) => {
        if (!message) return;
        show_toast(message, "error");
      },
    });

  return (
    <AccountAvatarButtonView
      accept={PROFILE_PICTURE_ACCEPT}
      avatar={
        <ProfileAvatar
          email={email}
          image_url={preview || image_url}
          name={name}
          profile_color={profile_color}
          size={size}
        />
      }
      className={className}
      file_input_ref={file_ref}
      is_paid_plan={is_paid_plan}
      label={t("auth.change_photo")}
      ring_offset_color={ring_offset_color}
      size={size}
      uploading={uploading}
      on_file_change={handle_file}
      on_open_picker={open_picker}
    />
  );
}
