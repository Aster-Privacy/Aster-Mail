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
import type { SyntheticEvent } from "react";

import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { copy_with_toast } from "@/utils/copy_with_toast";
import { cn } from "@/lib/utils";

interface RowCodeCopyButtonProps {
  code: string;
  muted?: boolean;
}

function stop_row_event(event: SyntheticEvent) {
  event.stopPropagation();
}

export function RowCodeCopyButton({ code, muted }: RowCodeCopyButtonProps) {
  const { t } = use_i18n();

  return (
    <Tooltip tip={t("mail.copy_code")}>
      <button
        aria-label={t("mail.copy_code_value", { code })}
        className={cn(
          "inline-flex h-6 flex-shrink-0 items-center gap-1 rounded-md border border-edge-secondary px-1.5 font-mono text-[12px] leading-none tabular-nums transition-colors hover:bg-black/10 hover:text-txt-primary dark:hover:bg-white/10",
          muted ? "text-txt-muted" : "text-txt-secondary",
        )}
        data-testid="row-copy-code"
        draggable={false}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          copy_with_toast(
            code,
            t("mail.code_copied"),
            t("common.failed_to_copy"),
          );
        }}
        onContextMenu={stop_row_event}
        onDoubleClick={stop_row_event}
        onDragStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={stop_row_event}
      >
        <span className="select-text">{code}</span>
        <ClipboardDocumentIcon aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
