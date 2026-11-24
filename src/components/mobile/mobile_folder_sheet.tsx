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
import type { DecryptedFolder } from "@/hooks/use_folders/tree";

import { useMemo } from "react";
import { CheckIcon, FolderIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { MobileBottomSheet } from "@/components/mobile/mobile_bottom_sheet";
import {
  folder_option_indent,
  order_folders_as_tree,
} from "@/hooks/use_folders/tree";

interface MobileFolderSheetProps {
  is_open: boolean;
  folders: DecryptedFolder[];
  current_tokens?: string[];
  on_close: () => void;
  on_select: (folder: DecryptedFolder) => void;
}

export function folder_sheet_options(
  folders: DecryptedFolder[],
): { folder: DecryptedFolder; depth: number }[] {
  return order_folders_as_tree(folders).filter(
    ({ folder }) => !folder.is_system && !folder.is_password_protected,
  );
}

export function MobileFolderSheet({
  is_open,
  folders,
  current_tokens,
  on_close,
  on_select,
}: MobileFolderSheetProps): React.ReactElement {
  const { t } = use_i18n();
  const options = useMemo(() => folder_sheet_options(folders), [folders]);

  return (
    <MobileBottomSheet
      aria_label={t("mail.move_to_folder")}
      is_open={is_open}
      on_close={on_close}
    >
      <div className="px-4 pb-4">
        <h3 className="mb-3 text-[16px] font-semibold text-[var(--text-primary)]">
          {t("mail.move_to_folder")}
        </h3>
        {options.length === 0 ? (
          <p className="px-3 py-3 text-[14px] text-[var(--text-muted)]">
            {t("common.no_folders_available")}
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {options.map(({ folder, depth }) => (
              <button
                key={folder.folder_token}
                className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-start active:bg-[var(--bg-tertiary)]"
                style={{ paddingInlineStart: 12 + folder_option_indent(depth) }}
                type="button"
                onClick={() => {
                  on_close();
                  on_select(folder);
                }}
              >
                <FolderIcon
                  className="h-5 w-5 flex-shrink-0"
                  style={{ color: folder.color || "var(--text-muted)" }}
                />
                <span className="flex-1 truncate text-[14px] font-medium text-[var(--text-primary)]">
                  {folder.name}
                </span>
                {current_tokens?.includes(folder.folder_token) && (
                  <CheckIcon className="h-5 w-5 text-[var(--text-primary)]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </MobileBottomSheet>
  );
}
