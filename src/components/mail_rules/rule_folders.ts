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
import type { DecryptedFolder } from "@/hooks/use_folders";
import type { TranslationKey } from "@/lib/i18n";

export type RuleSystemFolderType = "inbox" | "archive" | "spam" | "trash";

const RULE_SYSTEM_FOLDER_ORDER: RuleSystemFolderType[] = [
  "inbox",
  "archive",
  "spam",
  "trash",
];

const RULE_SYSTEM_FOLDER_LABEL_KEYS: Record<
  RuleSystemFolderType,
  TranslationKey
> = {
  inbox: "mail.inbox",
  archive: "mail.archive",
  spam: "mail.spam",
  trash: "mail.trash",
};

const RULE_CUSTOM_FOLDER_TYPES = new Set(["folder", "custom"]);

export function rule_system_folder_type(
  folder_type: string | undefined,
): RuleSystemFolderType | null {
  switch (folder_type) {
    case "inbox":
    case "default_open":
      return "inbox";
    case "archive":
    case "spam":
    case "trash":
      return folder_type;
    default:
      return null;
  }
}

export interface RuleSystemFolder {
  folder: DecryptedFolder;
  system_type: RuleSystemFolderType;
  label_key: TranslationKey;
}

export function rule_system_folders(
  folders: DecryptedFolder[],
): RuleSystemFolder[] {
  const result: RuleSystemFolder[] = [];

  for (const system_type of RULE_SYSTEM_FOLDER_ORDER) {
    const folder =
      folders.find((f) => f.folder_type === system_type) ??
      (system_type === "inbox"
        ? folders.find((f) => f.folder_type === "default_open")
        : undefined);

    if (folder) {
      result.push({
        folder,
        system_type,
        label_key: RULE_SYSTEM_FOLDER_LABEL_KEYS[system_type],
      });
    }
  }

  return result;
}

export function rule_custom_folders(
  folders: DecryptedFolder[],
): DecryptedFolder[] {
  return folders.filter(
    (f) =>
      !f.is_system && RULE_CUSTOM_FOLDER_TYPES.has(f.folder_type ?? "custom"),
  );
}

export function rule_folder_name(
  folders: DecryptedFolder[],
  token: string,
  t: (key: TranslationKey) => string,
): string | null {
  const folder = folders.find((f) => f.folder_token === token);

  if (!folder) return null;
  const system_type = rule_system_folder_type(folder.folder_type);

  return system_type
    ? t(RULE_SYSTEM_FOLDER_LABEL_KEYS[system_type])
    : folder.name;
}
