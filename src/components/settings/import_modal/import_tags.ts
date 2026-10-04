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
export const MAX_IMPORT_TAG_LEVELS = 5;
export const MAX_IMPORT_CREATED_TAGS = 200;

export interface ImportTagSource {
  name: string;
  tag_token: string;
  parent_token?: string;
}

export interface ImportTagResolution {
  tag_map: Map<string, string>;
  created: number;
  skipped: number;
}

export interface ResolveImportTagsInput {
  names: string[];
  existing_tags: ImportTagSource[];
  create_tag: (
    name: string,
    parent_token?: string,
  ) => Promise<ImportTagSource | null>;
  should_stop?: () => boolean;
  find_existing?: (
    name: string,
    parent_token?: string,
  ) => Promise<ImportTagSource | null | undefined>;
}

interface EnsuredTag {
  token: string | null;
  is_complete: boolean;
}

export function import_tag_key(name: string): string {
  return name.trim().toLowerCase();
}

export function import_tag_segments(path: string): string[] {
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length <= MAX_IMPORT_TAG_LEVELS) return segments;

  return [
    ...segments.slice(0, MAX_IMPORT_TAG_LEVELS - 1),
    segments.slice(MAX_IMPORT_TAG_LEVELS - 1).join("/"),
  ];
}

export function find_import_tag<T extends ImportTagSource>(
  tags: T[],
  name: string,
  parent_token?: string,
): T | undefined {
  const key = import_tag_key(name);

  return tags.find(
    (tag) =>
      import_tag_key(tag.name) === key &&
      (tag.parent_token || undefined) === (parent_token || undefined),
  );
}

function path_key(segments: string[]): string {
  return segments.map((segment) => segment.toLowerCase()).join("/");
}

function existing_tag_paths(tags: ImportTagSource[]): Map<string, string> {
  const by_token = new Map<string, ImportTagSource>();
  const paths = new Map<string, string>();

  for (const tag of tags) by_token.set(tag.tag_token, tag);

  for (const tag of tags) {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: ImportTagSource | undefined = tag;

    while (current && !seen.has(current.tag_token)) {
      seen.add(current.tag_token);
      names.unshift(current.name.trim().toLowerCase());
      current = current.parent_token
        ? by_token.get(current.parent_token)
        : undefined;
    }

    const key = names.join("/");

    if (key && !paths.has(key)) paths.set(key, tag.tag_token);
  }

  return paths;
}

export async function resolve_import_tags({
  names,
  existing_tags,
  create_tag,
  should_stop,
  find_existing,
}: ResolveImportTagsInput): Promise<ImportTagResolution> {
  const tag_map = new Map<string, string>();
  const known = existing_tag_paths(existing_tags);
  let created = 0;
  let skipped = 0;
  let consecutive_failures = 0;

  const ensure_tag = async (path: string): Promise<EnsuredTag> => {
    const whole = known.get(import_tag_key(path));

    if (whole) return { token: whole, is_complete: true };

    const segments = import_tag_segments(path);

    if (segments.length === 0) return { token: null, is_complete: false };
    if (segments.some((segment) => segment.length > MAX_TAG_NAME_LENGTH)) {
      return { token: null, is_complete: false };
    }

    let parent_token: string | undefined;

    for (let level = 1; level <= segments.length; level += 1) {
      const key = path_key(segments.slice(0, level));
      const existing = known.get(key);

      if (existing) {
        parent_token = existing;
        continue;
      }

      if (
        consecutive_failures >= MAX_CONSECUTIVE_TAG_FAILURES ||
        created >= MAX_IMPORT_CREATED_TAGS
      ) {
        return { token: parent_token ?? null, is_complete: false };
      }

      const segment = segments[level - 1];
      const tag = await create_tag(segment, parent_token).catch(() => null);

      if (!tag) {
        const found = find_existing
          ? await find_existing(segment, parent_token).catch(() => null)
          : null;

        if (found) {
          known.set(key, found.tag_token);
          parent_token = found.tag_token;
          continue;
        }

        consecutive_failures += 1;

        return { token: parent_token ?? null, is_complete: false };
      }

      consecutive_failures = 0;
      created += 1;
      known.set(key, tag.tag_token);
      parent_token = tag.tag_token;
    }

    return { token: parent_token ?? null, is_complete: true };
  };

  for (const name of names) {
    const key = import_tag_key(name);

    if (!key || tag_map.has(key)) continue;
    if (should_stop?.()) break;

    const { token, is_complete } = await ensure_tag(name);

    if (token) tag_map.set(key, token);
    if (!token || !is_complete) skipped += 1;
  }

  return { tag_map, created, skipped };
}
