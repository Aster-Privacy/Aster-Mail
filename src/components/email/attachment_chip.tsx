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
import type { ComponentType, SVGProps } from "react";

import { memo } from "react";
import {
  ArchiveBoxIcon,
  CodeBracketIcon,
  DocumentIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PaperClipIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  TableCellsIcon,
} from "@heroicons/react/16/solid";

import {
  CHIP_KIND_COLORS,
  get_chip_kind,
  truncate_filename,
  type AttachmentChipKind,
} from "@/lib/attachment_utils";

type ChipIcon = ComponentType<SVGProps<SVGSVGElement>>;

const CHIP_ICONS: Record<AttachmentChipKind, ChipIcon> = {
  pdf: DocumentIcon,
  image: PhotoIcon,
  document: DocumentTextIcon,
  sheet: TableCellsIcon,
  presentation: PresentationChartBarIcon,
  archive: ArchiveBoxIcon,
  audio: MusicalNoteIcon,
  video: FilmIcon,
  code: CodeBracketIcon,
  file: PaperClipIcon,
};

interface AttachmentChipProps {
  filename: string;
  content_type: string;
  type_label: string;
  muted?: boolean;
}

export const AttachmentChip = memo(function AttachmentChip({
  filename,
  content_type,
  type_label,
  muted,
}: AttachmentChipProps): React.ReactElement {
  const kind = get_chip_kind(content_type, filename);
  const Icon = CHIP_ICONS[kind];

  return (
    <span
      className="inline-flex h-5 min-w-0 max-w-[168px] flex-shrink items-center gap-1 rounded-[6px] border border-edge-secondary px-1.5 text-[11px] leading-none select-none"
      data-kind={kind}
      data-testid="attachment-chip"
      title={filename}
    >
      <Icon
        aria-hidden="true"
        className="h-3 w-3 flex-shrink-0"
        data-testid="attachment-chip-icon"
        style={{ color: CHIP_KIND_COLORS[kind] }}
      />
      <span className="sr-only">{`${type_label} `}</span>
      <span
        className={`truncate ${muted ? "text-txt-muted" : "text-txt-secondary"}`}
      >
        {truncate_filename(filename, 28)}
      </span>
    </span>
  );
});

export function AttachmentChipOverflow({
  count,
  label,
}: {
  count: number;
  label: string;
}): React.ReactElement | null {
  if (count <= 0) return null;

  return (
    <span
      className="inline-flex h-5 flex-shrink-0 items-center rounded-[6px] border border-edge-secondary px-1.5 text-[11px] font-medium leading-none tabular-nums text-txt-muted select-none"
      data-testid="attachment-chip-overflow"
      title={label}
    >
      <span aria-hidden="true">{`+${count}`}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
