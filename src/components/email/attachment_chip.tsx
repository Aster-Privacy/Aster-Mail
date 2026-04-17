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

import { truncate_filename } from "@/lib/attachment_utils";

interface AttachmentChipProps {
  filename: string;
  type_label: string;
  type_color: string;
  muted?: boolean;
}

export const AttachmentChip = memo(function AttachmentChip({
  filename,
  type_label,
  type_color,
  muted,
}: AttachmentChipProps): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight max-w-[160px] border border-edge-secondary"
      data-testid="attachment-chip"
      style={{ opacity: muted ? 0.6 : 1 }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: type_color }}
      />
      <span className="font-medium flex-shrink-0 text-txt-secondary">
        {type_label}
      </span>
      <span className="truncate text-txt-muted">
        {truncate_filename(filename)}
      </span>
    </span>
  );
});
