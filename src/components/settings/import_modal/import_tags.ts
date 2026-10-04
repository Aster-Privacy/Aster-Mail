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

export const MAX_TAG_NAME_LENGTH = 100;
export const MAX_CONSECUTIVE_TAG_FAILURES = 3;

export interface ImportTagSource {
  name: string;
  tag_token: string;
}

export interface ImportTagResolution {
  tag_map: Map<string, string>;
  created: number;
  skipped: number;
}

export interface ResolveImportTagsInput {
  names: string[];
  existing_tags: ImportTagSource[];
  create_tag: (name: string) => Promise<ImportTagSource | null>;
  should_stop?: () => boolean;
}

export function import_tag_key(name: string): string {
  return name.trim().toLowerCase();
}

export async function resolve_import_tags({
  names,
  existing_tags,
  create_tag,
  should_stop,
}: ResolveImportTagsInput): Promise<ImportTagResolution> {
  const tag_map = new Map<string, string>();
  const known = new Map<string, string>();
  let created = 0;
  let skipped = 0;
  let consecutive_failures = 0;

  for (const tag of existing_tags) {
    const key = import_tag_key(tag.name);

    if (!known.has(key)) known.set(key, tag.tag_token);
  }

  const ensure_tag = async (path: string): Promise<string | null> => {
    const key = import_tag_key(path);
    const existing = known.get(key);

    if (existing) return existing;
    if (path.trim().length > MAX_TAG_NAME_LENGTH) return null;
    if (consecutive_failures >= MAX_CONSECUTIVE_TAG_FAILURES) return null;

    const tag = await create_tag(path.trim()).catch(() => null);

    if (!tag) {
      consecutive_failures += 1;

      return null;
    }

    consecutive_failures = 0;
    created += 1;
    known.set(key, tag.tag_token);

    return tag.tag_token;
  };

  for (const name of names) {
    const key = import_tag_key(name);

    if (!key || tag_map.has(key)) continue;
    if (should_stop?.()) break;

    const token = await ensure_tag(name);

    if (token) tag_map.set(key, token);
    else skipped += 1;
  }

  return { tag_map, created, skipped };
}
