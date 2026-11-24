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
import type { OAuthFolderInfo } from "@/services/api/external_accounts/api";
import type {
  ExternalFolderLink,
  ExternalFolderSpecialUse,
  ExternalFolderTarget,
} from "@/services/api/external_accounts/types";

export const MAX_FOLDER_LINKS = 500;
export const MAX_REMOTE_NAME_LENGTH = 512;

const SPECIAL_USE_BY_LEAF: Record<string, ExternalFolderSpecialUse> = {
  inbox: "inbox",
  sent: "sent",
  "sent items": "sent",
  "sent messages": "sent",
  "sent mail": "sent",
  drafts: "drafts",
  draft: "drafts",
  trash: "trash",
  bin: "trash",
  deleted: "trash",
  "deleted items": "trash",
  "deleted messages": "trash",
  junk: "junk",
  "junk e-mail": "junk",
  "junk email": "junk",
  spam: "junk",
  archive: "archive",
  archives: "archive",
  "all mail": "all",
};

const TARGET_BY_SPECIAL_USE: Record<
  ExternalFolderSpecialUse,
  ExternalFolderTarget | null
> = {
  inbox: "inbox",
  sent: "sent",
  drafts: "drafts",
  trash: "trash",
  junk: "spam",
  archive: "archive",
  all: null,
};

function leaf_name(folder: OAuthFolderInfo): string {
  const parts = folder.delimiter
    ? folder.name.split(folder.delimiter).filter((part) => part.length > 0)
    : [folder.name];

  return (parts[parts.length - 1] ?? folder.name).trim().toLowerCase();
}

export function infer_special_use(
  folder: OAuthFolderInfo,
): ExternalFolderSpecialUse | undefined {
  if (folder.special_use) return folder.special_use;
  if (folder.name.toUpperCase() === "INBOX") return "inbox";

  const leaf = leaf_name(folder);

  if (leaf === "inbox") return undefined;

  return SPECIAL_USE_BY_LEAF[leaf];
}

export function build_folder_links(
  folders: OAuthFolderInfo[],
  mapping: Record<string, string> = {},
): ExternalFolderLink[] {
  const links: ExternalFolderLink[] = [];
  const seen = new Set<string>();

  for (const folder of folders) {
    if (links.length >= MAX_FOLDER_LINKS) break;
    if (!folder.name || folder.name.length > MAX_REMOTE_NAME_LENGTH) continue;
    if (seen.has(folder.name)) continue;

    const special_use = infer_special_use(folder);
    const folder_token = mapping[folder.name];
    const system_target = special_use
      ? TARGET_BY_SPECIAL_USE[special_use]
      : null;

    if (folder_token) {
      seen.add(folder.name);
      links.push({
        remote_name: folder.name,
        ...(special_use && { special_use }),
        aster_target: "custom",
        folder_token,
      });
      continue;
    }

    if (!system_target) continue;

    seen.add(folder.name);
    links.push({
      remote_name: folder.name,
      special_use,
      aster_target: system_target,
    });
  }

  return links;
}
