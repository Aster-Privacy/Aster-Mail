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
import { useCallback } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  forward_as_attachment,
  handle_mail_drop,
} from "@/services/forward_as_attachment";

export function use_mail_drop_attach(): (
  data_transfer: DataTransfer | null,
  add_files: (files: File[]) => void,
) => boolean {
  const { t } = use_i18n();

  return useCallback(
    (data_transfer, add_files) =>
      handle_mail_drop(data_transfer, add_files, () => {
        show_toast(t("mail.forward_as_attachment_failed"), "error");
      }) !== null,
    [t],
  );
}

export function use_forward_as_attachment(): (mail_ids: string[]) => Promise<void> {
  const { t } = use_i18n();

  return useCallback(
    async (mail_ids) => {
      const ids = mail_ids.filter((id) => !!id);

      if (ids.length === 0) return;

      try {
        const result = await forward_as_attachment(
          ids,
          t("mail.forward_subject_prefix"),
        );

        if (result.failed > 0) {
          show_toast(t("mail.forward_as_attachment_failed"), "error");
        }
      } catch {
        show_toast(t("mail.forward_as_attachment_failed"), "error");
      }
    },
    [t],
  );
}
