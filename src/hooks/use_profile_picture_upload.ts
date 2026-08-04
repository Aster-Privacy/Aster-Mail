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
import { useCallback, useRef, useState } from "react";

import { show_toast } from "@/components/toast/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import { update_profile_picture } from "@/services/api/user";

const MAX_SIZE = 256;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const PROFILE_PICTURE_ACCEPT = ACCEPTED_TYPES.join(",");

export function compress_image(file: File): Promise<string> {
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

interface UseProfilePictureUploadOptions {
  on_error?: (message: string | null) => void;
  toast_on_success?: boolean;
}

export function use_profile_picture_upload(
  options: UseProfilePictureUploadOptions = {},
) {
  const { on_error, toast_on_success = true } = options;
  const { t } = use_i18n();
  const { user, update_user } = use_auth();

  const file_ref = useRef<HTMLInputElement>(null);
  const [uploading, set_uploading] = useState(false);
  const [removing, set_removing] = useState(false);
  const [preview, set_preview] = useState<string | null>(null);
  const [error, set_error] = useState<string | null>(null);

  const report_error = useCallback(
    (message: string | null) => {
      set_error(message);
      on_error?.(message);
    },
    [on_error],
  );

  const open_picker = useCallback(() => {
    if (uploading || removing) return;
    file_ref.current?.click();
  }, [uploading, removing]);

  const handle_file = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (!file) return;

      if (!ACCEPTED_TYPES.includes(file.type)) {
        report_error(t("common.valid_image_error"));
        if (file_ref.current) file_ref.current.value = "";

        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        report_error(t("common.image_size_error"));
        if (file_ref.current) file_ref.current.value = "";

        return;
      }

      set_uploading(true);
      report_error(null);

      try {
        const compressed = await compress_image(file);

        set_preview(compressed);

        const response = await update_profile_picture(compressed);

        if (response.error) {
          report_error(response.error);
          set_preview(null);
        } else if (response.data?.success && user) {
          await update_user({ ...user, profile_picture: compressed });
          set_preview(null);
          report_error(null);
          if (toast_on_success) {
            show_toast(t("common.profile_picture_updated"), "success");
          }
        } else {
          report_error(t("common.failed_save_profile_picture"));
          set_preview(null);
        }
      } catch {
        set_preview(null);
        report_error(t("common.failed_upload_image"));
      } finally {
        set_uploading(false);
        if (file_ref.current) file_ref.current.value = "";
      }
    },
    [report_error, t, toast_on_success, update_user, user],
  );

  const remove_picture = useCallback(async () => {
    if (removing || uploading || !user?.profile_picture) return;

    set_removing(true);
    report_error(null);

    try {
      const response = await update_profile_picture(null);

      if (response.error) {
        report_error(response.error);
      } else if (response.data?.success && user) {
        await update_user({ ...user, profile_picture: undefined });
        set_preview(null);
        if (toast_on_success) {
          show_toast(t("common.profile_picture_removed"), "success");
        }
      } else {
        report_error(t("common.failed_remove_profile_picture"));
      }
    } catch {
      report_error(t("common.failed_remove_profile_picture"));
    } finally {
      set_removing(false);
    }
  }, [removing, uploading, user, report_error, t, toast_on_success, update_user]);

  return {
    file_ref,
    uploading,
    removing,
    preview,
    error,
    open_picker,
    handle_file,
    remove_picture,
    set_error: report_error,
  };
}
