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
import { memo } from "react";
import { MobileAttachmentRow as MobileAttachmentRowView } from "@aster/ui";

import { format_bytes } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";

interface MobileAttachmentRowProps {
  filename: string;
  content_type: string;
  size: number;
  on_download?: () => void;
  is_downloading?: boolean;
}

export const MobileAttachmentRow = memo(function MobileAttachmentRow({
  filename,
  content_type,
  size,
  on_download,
  is_downloading = false,
}: MobileAttachmentRowProps) {
  const { t } = use_i18n();

  return (
    <MobileAttachmentRowView
      content_type={content_type}
      download_label={t("common.download")}
      filename={filename}
      is_downloading={is_downloading}
      size_label={format_bytes(size)}
      on_download={on_download}
    />
  );
});
