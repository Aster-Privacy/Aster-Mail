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
import type { ExternalAccountFolder } from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { ArrowPathIcon, FolderIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { get_folder_depth } from "@/components/settings/hooks/use_external_accounts";

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
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-txt-primary">
          <FolderIcon className="w-4 h-4 text-txt-muted" />
          {t("settings.imap_folders")}
        </h3>
        <Button
          aria-label={t("settings.fetch_imap_folders")}
          className="gap-1.5"
          disabled={is_fetching_folders}
          size="md"
          variant="outline"
          onClick={handle_fetch_folders}
        >
          {is_fetching_folders ? (
            <Spinner size="md" />
          ) : (
            <ArrowPathIcon className="w-3.5 h-3.5" />
          )}
          {t("settings.fetch_folders")}
        </Button>
      </div>
      {truncated_folders.length > 0 && (
        <div
          aria-label={t("settings.imap_folder_selection")}
          className="rounded-lg border max-h-48 overflow-y-auto border-edge-primary bg-surf-secondary"
          role="group"
        >
          {truncated_folders.map((folder) => {
            const folder_path = folder.path || folder.name;
            const depth = Math.min(
              get_folder_depth(folder_path, folder.delimiter),
              10,
            );
            const is_selected = selected_folders.includes(folder_path);
            const folder_id = `ext-folder-${folder_path.replace(/[^a-zA-Z0-9]/g, "-")}`;
            const is_selectable = folder.is_selectable !== false;

            return (
              <div
                key={folder_path}
                className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-surf-hover"
                style={{
                  paddingLeft: `${12 + depth * 16}px`,
                }}
              >
                <Checkbox
                  checked={is_selected}
                  disabled={!is_selectable}
                  id={folder_id}
                  onCheckedChange={() => handle_folder_toggle(folder_path)}
                />
                <label
                  className={`text-sm flex-1 truncate cursor-pointer ${is_selectable ? "text-txt-primary" : "text-txt-muted"}`}
                  htmlFor={folder_id}
                  title={folder_path}
                >
                  {folder.name}
                </label>
                {(folder.message_count ?? 0) > 0 && (
                  <span className="text-[11px] flex-shrink-0 text-txt-muted">
                    {folder.message_count} {t("settings.msgs")}
                    {(folder.unseen_count ?? 0) > 0 && (
                      <span className="text-accent">
                        {" "}
                        ({folder.unseen_count} {t("settings.new")})
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {available_folders.length > 200 && (
            <div className="px-3 py-2 text-xs text-txt-muted">
              {t("settings.showing_folders", {
                shown: "200",
                total: String(available_folders.length),
              })}
            </div>
          )}
        </div>
      )}
      {available_folders.length === 0 && (
        <p className="text-xs text-txt-muted">
          {has_fetched_folders
            ? t("settings.no_folders_found")
            : t("settings.fetch_folders_instruction")}
        </p>
      )}
    </div>
  );
}
