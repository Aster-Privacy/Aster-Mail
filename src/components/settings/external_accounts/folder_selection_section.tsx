//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ExternalAccountFolder } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { ArrowPathIcon, FolderIcon } from "@heroicons/react/24/outline";
import { Button, Checkbox, IslandSection } from "@aster/ui";

import { get_folder_depth } from "@/components/settings/hooks/use_external_accounts";
import { decode_modified_utf7 } from "@/services/external_folder_mirror";

const MAX_INDENT_DEPTH = 6;

export function get_folder_leaf_name(
  path: string,
  delimiter?: string | null,
): string {
  if (!delimiter) return decode_modified_utf7(path);

  const segments = path.split(delimiter).filter((segment) => segment !== "");

  return decode_modified_utf7(
    segments.length > 0 ? segments[segments.length - 1] : path,
  );
}

interface FolderSelectionSectionProps {
  available_folders: ExternalAccountFolder[];
  truncated_folders: ExternalAccountFolder[];
  selected_folders: string[];
  is_fetching_folders: boolean;
  has_fetched_folders: boolean;
  handle_fetch_folders: () => void;
  handle_folder_toggle: (folder_path: string) => void;
  t: TranslationFn;
}

export function FolderSelectionSection({
  available_folders,
  truncated_folders,
  selected_folders,
  is_fetching_folders,
  has_fetched_folders,
  handle_fetch_folders,
  handle_folder_toggle,
  t,
}: FolderSelectionSectionProps) {
  const selected_count = truncated_folders.filter((folder) =>
    selected_folders.includes(folder.path || folder.name),
  ).length;

  return (
    <IslandSection
      description={t("settings.ext_v2_folders_inbox_note")}
      icon={<FolderIcon />}
      title={t("settings.imap_folders")}
      trailing={
        <Button
          aria-label={t("settings.fetch_imap_folders")}
          className="gap-1.5"
          disabled={is_fetching_folders}
          is_loading={is_fetching_folders}
          size="sm"
          variant="outline"
          onClick={handle_fetch_folders}
        >
          {!is_fetching_folders && <ArrowPathIcon className="w-3.5 h-3.5" />}
          {t("settings.fetch_folders")}
        </Button>
      }
    >
      {truncated_folders.length > 0 ? (
        <div>
          <div className="flex items-center justify-between gap-3 px-4 h-10 text-xs text-txt-muted border-b border-[var(--aster-island-divider)]">
            <span aria-live="polite" data-testid="ext-folder-selected-count">
              {t("settings.ext_v2_folders_selected", {
                selected: selected_count,
                total: truncated_folders.length,
              })}
            </span>
            {available_folders.length > truncated_folders.length && (
              <span>
                {t("settings.showing_folders", {
                  shown: String(truncated_folders.length),
                  total: available_folders.length,
                })}
              </span>
            )}
          </div>
          <div
            aria-label={t("settings.imap_folder_selection")}
            className="max-h-[288px] overflow-y-auto overscroll-contain py-1"
            role="group"
          >
            {truncated_folders.map((folder) => {
              const folder_path = folder.path || folder.name;
              const depth = Math.min(
                get_folder_depth(folder_path, folder.delimiter),
                MAX_INDENT_DEPTH,
              );
              const is_selected = selected_folders.includes(folder_path);
              const folder_id = `ext-folder-${folder_path.replace(/[^a-zA-Z0-9]/g, "-")}`;
              const is_selectable = folder.is_selectable !== false;
              const message_count = folder.message_count ?? 0;
              const unseen_count = folder.unseen_count ?? 0;

              return (
                <div
                  key={folder_path}
                  className={`flex items-center gap-3 min-h-10 pe-4 py-1.5 transition-colors ${
                    is_selectable
                      ? "cursor-pointer hover:bg-[var(--aster-hover)]"
                      : "cursor-default opacity-60"
                  }`}
                  data-folder-row={folder_path}
                  role="presentation"
                  style={{ paddingInlineStart: `${16 + depth * 20}px` }}
                  title={folder_path}
                  onClick={(event) => {
                    if (!is_selectable) return;
                    if (
                      (event.target as HTMLElement).closest(".aster_checkbox")
                    )
                      return;
                    handle_folder_toggle(folder_path);
                  }}
                >
                  <Checkbox
                    aria-labelledby={`${folder_id}-name`}
                    checked={is_selected}
                    disabled={!is_selectable}
                    id={folder_id}
                    onCheckedChange={() => handle_folder_toggle(folder_path)}
                  />
                  <FolderIcon
                    aria-hidden="true"
                    className={`w-4 h-4 shrink-0 ${is_selected ? "text-[var(--accent-color)]" : "text-txt-muted"}`}
                  />
                  <span
                    className="flex-1 min-w-0 truncate text-sm text-txt-primary"
                    id={`${folder_id}-name`}
                  >
                    {get_folder_leaf_name(folder_path, folder.delimiter)}
                  </span>
                  {unseen_count > 0 && (
                    <span className="shrink-0 rounded-full px-1.5 min-w-5 h-5 inline-flex items-center justify-center text-[11px] font-semibold tabular-nums text-[var(--accent-color)] bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)]">
                      {unseen_count.toLocaleString()}
                    </span>
                  )}
                  {message_count > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-txt-muted">
                      {message_count.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
          <span className="grid place-items-center w-10 h-10 rounded-full bg-[var(--aster-field-bg)] text-txt-muted">
            <FolderIcon aria-hidden="true" className="w-5 h-5" />
          </span>
          <p className="text-[13px] text-txt-muted max-w-xs">
            {has_fetched_folders
              ? t("settings.no_folders_found")
              : t("settings.fetch_folders_instruction")}
          </p>
        </div>
      )}
    </IslandSection>
  );
}
