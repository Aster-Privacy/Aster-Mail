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
import type { } from "@/lib/i18n/types";
import type { TextAlignment, } from "@/hooks/use_editor";
import type { } from "@/components/compose/compose_shared";


import { use_i18n } from "@/lib/i18n/context";

import { ToolbarButton } from "./shared";

export function AlignmentGroup({
  current,
  on_change,
}: {
  current: TextAlignment;
  on_change: (alignment: TextAlignment) => void;
}) {
  const { t } = use_i18n();

  return (
    <div
      aria-label={t("mail.text_alignment")}
      className="flex items-center gap-0.5"
      role="group"
    >
      <ToolbarButton
        active={current === "left"}
        title={t("mail.align_left")}
        onClick={() => on_change("left")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={current === "center"}
        title={t("mail.align_center")}
        onClick={() => on_change("center")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        active={current === "right"}
        title={t("mail.align_right")}
        onClick={() => on_change("right")}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

