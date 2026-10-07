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

import {
  list_oauth_folders,
  save_folder_mapping,
} from "@/services/api/external_accounts/api";
import {
  encrypt_folder_field,
  generate_folder_token,
} from "@/hooks/use_folders";
import {
  decrypt_tag,
  encrypt_tag_field,
  generate_tag_token,
} from "@/hooks/use_tags";
import { create_folder } from "@/services/api/folders";
import { create_tag, list_tags } from "@/services/api/tags";
import { request_cache } from "@/services/api/request_cache";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";
import { emit_folders_changed, emit_tags_changed } from "@/hooks/mail_events";

const MAX_TAG_DEPTH = 4;
const TAG_LIST_PAGE_SIZE = 500;
const TAG_LIST_MAX_PAGES = 40;

export interface ExistingFolder {
  folder_token: string;
  name: string;
  parent_token?: string | null;
  is_system?: boolean;
}

export type CreateFolderFn = (
  name: string,
  parent_token: string | undefined,
) => Promise<string | null>;

export interface FolderTreeMirror {
  mapping: Record<string, string>;
  failures: number;
}

export type MirrorOutcome =
  | { status: "ok"; mapped: number; failures: number }
  | { status: "no_vault" }
  | { status: "cancelled" }
  | { status: "error" };

function decode_utf16_base64(encoded: string): string | null {
  const base64 = encoded.replace(/,/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;

  try {
    binary = atob(padded);
  } catch {
    return null;
  }

  if (binary.length % 2 !== 0) return null;

  const units: number[] = [];

  for (let i = 0; i < binary.length; i += 2) {
    units.push((binary.charCodeAt(i) << 8) | binary.charCodeAt(i + 1));
  }

  return String.fromCharCode(...units);
}

export function decode_modified_utf7(name: string): string {
  if (!name.includes("&")) return name;

  let decoded = "";
  let i = 0;

  while (i < name.length) {
    const start = name.indexOf("&", i);

    if (start === -1) {
      decoded += name.slice(i);
      break;
    }

    decoded += name.slice(i, start);
    const end = name.indexOf("-", start + 1);

    if (end === -1) return name;

    if (end === start + 1) {
      decoded += "&";
    } else {
      const chunk = decode_utf16_base64(name.slice(start + 1, end));

      if (chunk === null) return name;
      decoded += chunk;
    }

    i = end + 1;
  }

  return decoded;
}

function folder_path_parts(folder: OAuthFolderInfo): string[] {
  const parts = folder.delimiter
    ? folder.name
        .split(folder.delimiter)
        .filter((part) => part.length > 0)
        .map(decode_modified_utf7)
    : [decode_modified_utf7(folder.name)];

  if (parts.length > 1 && parts[0].toUpperCase() === "INBOX") {
    return parts.slice(1);
  }

  return parts;
}

function cap_path_depth(parts: string[], max_depth?: number): string[] {
  if (!max_depth || parts.length <= max_depth) return parts;

  return [
    ...parts.slice(0, max_depth - 1),
    parts.slice(max_depth - 1).join("/"),
  ];
}

export function select_mirrored_folders(
  folders: OAuthFolderInfo[],
): OAuthFolderInfo[] {
  return folders
    .filter((f) => !f.excluded && f.name.toUpperCase() !== "INBOX")
    .filter((f) => folder_path_parts(f).length > 0)
    .sort((a, b) => folder_path_parts(a).length - folder_path_parts(b).length);
}

export async function mirror_folder_tree(
  folders: OAuthFolderInfo[],
  existing: ExistingFolder[],
  create: CreateFolderFn,
  is_cancelled: () => boolean = () => false,
  max_depth?: number,
): Promise<FolderTreeMirror> {
  const mapping: Record<string, string> = {};
  const path_tokens = new Map<string, string>();
  const known: ExistingFolder[] = existing.filter((f) => !f.is_system);
  let failures = 0;

  const find_known = (name: string, parent_token: string | undefined) =>
    known.find(
      (f) =>
        f.name.toLowerCase() === name.toLowerCase() &&
        (f.parent_token || undefined) === parent_token,
    )?.folder_token;

  for (const folder of select_mirrored_folders(folders)) {
    if (is_cancelled()) break;

    const parts = cap_path_depth(folder_path_parts(folder), max_depth);
    let parent_token: string | undefined;
    let branch_ok = true;

    for (let i = 0; i < parts.length; i++) {
      const path_key = parts.slice(0, i + 1).join("\u0000");
      let token = path_tokens.get(path_key);

      if (!token) {
        token = find_known(parts[i], parent_token);
      }

      if (!token) {
        try {
          token = (await create(parts[i], parent_token)) ?? undefined;
        } catch {
          token = undefined;
        }

        if (!token) {
          failures++;
          branch_ok = false;
          break;
        }

        known.push({
          folder_token: token,
          name: parts[i],
          parent_token: parent_token ?? null,
        });
      }

      path_tokens.set(path_key, token);
      parent_token = token;
    }

    if (branch_ok && parent_token) {
      mapping[folder.name] = parent_token;
    }
  }

  return { mapping, failures };
}

export async function mirror_external_account_folders(
  account_token: string,
  existing: ExistingFolder[],
  t?: Parameters<typeof ensure_default_labels>[1],
  is_cancelled: () => boolean = () => false,
): Promise<MirrorOutcome> {
  const vault = get_vault_from_memory();

  if (!vault?.identity_key) return { status: "no_vault" };

  await ensure_default_labels(vault, t);

  const listed = await list_oauth_folders(account_token);

  if (listed.error || !listed.data) return { status: "error" };

  const identity_key = vault.identity_key;
  const result = await mirror_folder_tree(
    listed.data.folders ?? [],
    existing,
    async (name, parent_token) => {
      const token = generate_folder_token();
      const { encrypted, nonce } = await encrypt_folder_field(
        name,
        identity_key,
      );
      const created = await create_folder({
        folder_token: token,
        encrypted_name: encrypted,
        name_nonce: nonce,
        parent_token,
      });

      return created.error ? null : token;
    },
    is_cancelled,
  );

  if (Object.keys(result.mapping).length > 0 || result.failures > 0) {
    emit_folders_changed();
  }

  if (is_cancelled()) return { status: "cancelled" };

  const label_mapping = listed.data.uses_labels
    ? await mirror_source_labels(
        listed.data.folders ?? [],
        identity_key,
        is_cancelled,
      )
    : {};

  if (is_cancelled()) return { status: "cancelled" };

  const mapped = Object.keys(result.mapping).length;

  if (mapped > 0 || Object.keys(label_mapping).length > 0) {
    const saved = await save_folder_mapping(
      account_token,
      result.mapping,
      label_mapping,
    );

    if (saved.error) return { status: "error" };
  }

  return { status: "ok", mapped, failures: result.failures };
}

async function load_existing_tags(
  identity_key: string,
): Promise<ExistingFolder[] | null> {
  const existing: ExistingFolder[] = [];

  for (let page = 0; page < TAG_LIST_MAX_PAGES; page++) {
    const response = await list_tags({
      limit: TAG_LIST_PAGE_SIZE,
      offset: page * TAG_LIST_PAGE_SIZE,
    });

    if (response.error || !response.data) return null;

    const decrypted = await Promise.all(
      response.data.tags.map((tag) => decrypt_tag(tag, identity_key)),
    );

    for (const tag of decrypted) {
      if (!tag) continue;
      existing.push({
        folder_token: tag.tag_token,
        name: tag.name,
        parent_token: tag.parent_token ?? null,
      });
    }

    if (!response.data.has_more) return existing;
  }

  return existing;
}

export async function mirror_source_labels(
  folders: OAuthFolderInfo[],
  identity_key: string,
  is_cancelled: () => boolean = () => false,
): Promise<Record<string, string>> {
  const existing = await load_existing_tags(identity_key);

  if (!existing) return {};

  let limit_reached = false;
  const result = await mirror_folder_tree(
    folders,
    existing,
    async (name, parent_token) => {
      const tag_token = generate_tag_token();
      const { encrypted, nonce } = await encrypt_tag_field(
        name,
        identity_key,
      );
      const created = await create_tag({
        tag_token,
        encrypted_name: encrypted,
        name_nonce: nonce,
        parent_token,
      });

      if (created.server_code === "PLAN_LIMIT_EXCEEDED") {
        limit_reached = true;
      }

      return created.error ? null : tag_token;
    },
    () => limit_reached || is_cancelled(),
    MAX_TAG_DEPTH,
  );

  if (Object.keys(result.mapping).length > 0 || result.failures > 0) {
    request_cache.invalidate("/mail/v1/tags");
    emit_tags_changed();
  }

  return result.mapping;
}
