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
import { MAX_FOLDER_DEPTH } from "@/hooks/use_folders/tree";

export const MAX_IMPORT_FOLDER_NAME_LENGTH = 100;
export const MAX_IMPORT_FOLDER_LEVELS = MAX_FOLDER_DEPTH + 1;
export const FOLDER_PATH_SEPARATOR = /[\\/]/;
export const STORE_ROOT_SEGMENT =
  /^(top of .+|root - .+|ipm_subtree|\[gmail\]|\[google mail\])$/;

const PLAN_LIMIT_CODE = "PLAN_LIMIT_EXCEEDED";

export interface ImportFolderSource {
  name: string;
  folder_token: string;
  parent_token?: string;
  is_system?: boolean;
}

export interface ImportFolderCreateResult {
  folder: ImportFolderSource | null;
  code?: string;
}

export interface ImportFolderResolution {
  folder_map: Map<string, string>;
  created: number;
  skipped: number;
}

export interface ResolveImportFoldersInput {
  paths: string[];
  existing_folders: ImportFolderSource[];
  create_folder: (
    name: string,
    parent_token?: string,
  ) => Promise<ImportFolderCreateResult>;
  should_stop?: () => boolean;
  find_existing?: (
    name: string,
    parent_token?: string,
  ) => ImportFolderSource | null | undefined;
}

function cap_length(segment: string): string {
  const chars = Array.from(segment);

  if (chars.length <= MAX_IMPORT_FOLDER_NAME_LENGTH) return segment;

  return chars.slice(0, MAX_IMPORT_FOLDER_NAME_LENGTH).join("").trim();
}

export function folder_path_segments(path: string): string[] {
  const segments = path
    .split(FOLDER_PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  let start = 0;

  while (
    start < segments.length - 1 &&
    STORE_ROOT_SEGMENT.test(segments[start].toLowerCase())
  ) {
    start++;
  }

  const kept = segments.slice(start);
  const levels =
    kept.length <= MAX_IMPORT_FOLDER_LEVELS
      ? kept
      : [
          ...kept.slice(0, MAX_IMPORT_FOLDER_LEVELS - 1),
          kept.slice(MAX_IMPORT_FOLDER_LEVELS - 1).join("/"),
        ];

  return levels.map(cap_length).filter((segment) => segment.length > 0);
}

export function normalize_folder_path(path: string): string {
  return folder_path_segments(path).join("/");
}

export function folder_path_key(path: string): string {
  return normalize_folder_path(path).toLowerCase();
}

export function find_import_folder<T extends ImportFolderSource>(
  folders: T[],
  name: string,
  parent_token?: string,
): T | undefined {
  const key = name.trim().toLowerCase();
  const custom_tokens = new Set(
    folders.filter((f) => !f.is_system).map((f) => f.folder_token),
  );
  const target_parent = parent_token || undefined;
  const shares_parent = (folder: T) =>
    target_parent
      ? folder.parent_token === target_parent
      : !folder.parent_token || !custom_tokens.has(folder.parent_token);

  return folders.find(
    (folder) =>
      folder.name.trim().toLowerCase() === key && shares_parent(folder),
  );
}

export async function resolve_import_folders({
  paths,
  existing_folders,
  create_folder,
  should_stop,
  find_existing,
}: ResolveImportFoldersInput): Promise<ImportFolderResolution> {
  const folder_map = new Map<string, string>();
  const known: ImportFolderSource[] = [...existing_folders];
  let created = 0;
  let skipped = 0;
  let limit_reached = false;

  for (const path of paths) {
    if (should_stop?.()) break;

    const segments = folder_path_segments(path);
    const key = segments.join("/").toLowerCase();

    if (!key || folder_map.has(key)) continue;

    let parent: ImportFolderSource | undefined;
    let is_complete = true;

    for (const segment of segments) {
      const existing = find_import_folder(known, segment, parent?.folder_token);

      if (existing) {
        parent = existing;
        continue;
      }

      if (limit_reached) {
        is_complete = false;
        break;
      }

      const result = await create_folder(segment, parent?.folder_token).catch(
        (): ImportFolderCreateResult => ({ folder: null }),
      );

      if (result.folder) {
        const folder: ImportFolderSource = {
          ...result.folder,
          parent_token: parent?.folder_token,
        };

        known.push(folder);
        created += 1;
        parent = folder;
        continue;
      }

      const found = find_existing?.(segment, parent?.folder_token);

      if (found) {
        known.push(found);
        parent = found;
        continue;
      }

      if (result.code === PLAN_LIMIT_CODE) limit_reached = true;
      is_complete = false;
      break;
    }

    if (parent && !parent.is_system) folder_map.set(key, parent.folder_token);
    if (!is_complete) skipped += 1;
  }

  return { folder_map, created, skipped };
}
