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
import { create_folder } from "@/services/api/folders";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { ensure_default_labels } from "@/services/labels/ensure_defaults";
import { emit_folders_changed } from "@/hooks/mail_events";

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

function folder_path_parts(folder: OAuthFolderInfo): string[] {
  const parts = folder.delimiter
    ? folder.name.split(folder.delimiter).filter((part) => part.length > 0)
    : [folder.name];

  if (parts.length > 1 && parts[0].toUpperCase() === "INBOX") {
    return parts.slice(1);
  }

  return parts;
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

    const parts = folder_path_parts(folder);
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

  const mapped = Object.keys(result.mapping).length;

  if (mapped > 0) {
    const saved = await save_folder_mapping(account_token, result.mapping);

    if (saved.error) return { status: "error" };
  }

  return { status: "ok", mapped, failures: result.failures };
}
