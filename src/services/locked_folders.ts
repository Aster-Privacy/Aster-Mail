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
import { get_cached_folders } from "@/hooks/use_folders";
import { ignore_error } from "@/lib/ignore_error";

import {
  get_unlock_token,
  is_folder_unlock_live,
} from "@/services/folder_unlock_store";

export const FOLDER_UNLOCK_REQUIRED_EVENT = "aster:folder-unlock-required";

export interface FolderUnlockRequiredDetail {
  folder_id: string;
  folder_token: string;
  folder_name: string;
}

interface TokenBearingLabel {
  token: string;
}

interface FolderTokenBearingLabel {
  folder_token: string;
}

export function has_protected_folders(): boolean {
  for (const folder of get_cached_folders()) {
    if (folder.is_password_protected && folder.password_set) return true;
  }

  return false;
}

export function get_locked_folder_tokens(): Set<string> {
  const tokens = new Set<string>();

  for (const folder of get_cached_folders()) {
    if (!folder.is_password_protected || !folder.password_set) continue;
    if (is_folder_unlock_live(folder.id)) continue;

    tokens.add(folder.folder_token);
  }

  return tokens;
}

export function get_locked_folders(): {
  folder_id: string;
  folder_token: string;
  folder_name: string;
}[] {
  const locked: {
    folder_id: string;
    folder_token: string;
    folder_name: string;
  }[] = [];

  for (const folder of get_cached_folders()) {
    if (!folder.is_password_protected || !folder.password_set) continue;
    if (is_folder_unlock_live(folder.id)) continue;

    locked.push({
      folder_id: folder.id,
      folder_token: folder.folder_token,
      folder_name: folder.name,
    });
  }

  return locked;
}

export function is_folder_token_locked(folder_token: string): boolean {
  if (!folder_token) return false;
  if (!has_protected_folders()) return false;

  return get_locked_folder_tokens().has(folder_token);
}

export function has_locked_folder_label(
  labels?: TokenBearingLabel[] | null,
): boolean {
  if (!labels || labels.length === 0) return false;

  const tokens = get_locked_folder_tokens();

  if (tokens.size === 0) return false;

  return labels.some((label) => tokens.has(label.token));
}

function item_tokens(item: {
  folder_token?: string;
  labels?: TokenBearingLabel[];
  folders?: TokenBearingLabel[];
}): string[] {
  const tokens: string[] = [];

  if (item.folder_token) tokens.push(item.folder_token);
  for (const label of item.labels ?? []) tokens.push(label.token);
  for (const folder of item.folders ?? []) tokens.push(folder.token);

  return tokens;
}

export function is_mail_item_locked(item: {
  folder_token?: string;
  labels?: TokenBearingLabel[];
  folders?: TokenBearingLabel[];
}): boolean {
  const locked = get_locked_folder_tokens();

  if (locked.size === 0) return false;

  return item_tokens(item).some((token) => locked.has(token));
}

export function filter_locked_mail_items<
  T extends {
    folder_token?: string;
    labels?: TokenBearingLabel[];
    folders?: TokenBearingLabel[];
  },
>(items: T[]): T[] {
  if (items.length === 0) return items;

  const locked = get_locked_folder_tokens();

  if (locked.size === 0) return items;

  return items.filter(
    (item) => !item_tokens(item).some((token) => locked.has(token)),
  );
}

export function filter_locked_folder_emails<
  T extends { folders?: FolderTokenBearingLabel[] },
>(emails: T[]): T[] {
  if (emails.length === 0) return emails;

  const locked = get_locked_folder_tokens();

  if (locked.size === 0) return emails;

  return emails.filter((email) => {
    if (!email.folders || email.folders.length === 0) return true;

    return !email.folders.some((folder) => locked.has(folder.folder_token));
  });
}

export function get_unlock_token_for_label(
  label_token: string | null | undefined,
): string | null {
  if (!label_token) return null;

  return get_unlock_token(label_token);
}

export function get_unlock_token_for_view(view: string): string | null {
  if (!view.startsWith("folder-")) return null;

  return get_unlock_token_for_label(view.replace("folder-", ""));
}

export function request_folder_unlock(
  folder_token?: string | null,
): boolean {
  if (typeof window === "undefined") return false;

  const locked = get_locked_folders();

  if (locked.length === 0) return false;

  const target = folder_token
    ? locked.find((folder) => folder.folder_token === folder_token)
    : locked.length === 1
      ? locked[0]
      : undefined;

  if (!target) return false;

  window.dispatchEvent(
    new CustomEvent<FolderUnlockRequiredDetail>(FOLDER_UNLOCK_REQUIRED_EVENT, {
      detail: target,
    }),
  );

  return true;
}

export async function purge_locked_folder_local_caches(): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  try {
    const { clear_search_snapshots } = await import(
      "@/services/search_index_store"
    );

    tasks.push(clear_search_snapshots());
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_search_index } = await import("@/hooks/use_search");

    clear_search_index();
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_mail_cache } = await import("@/hooks/email_list_cache");

    clear_mail_cache();
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_email_cache } = await import(
      "@/services/offline_email_cache"
    );

    tasks.push(clear_email_cache());
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_category_index, clear_entry_previews } = await import(
      "@/services/category_index"
    );

    clear_entry_previews();
    tasks.push(clear_category_index());
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_category_preview_cache } = await import(
      "@/hooks/use_category_previews"
    );

    clear_category_preview_cache();
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_attachment_meta_cache } = await import(
      "@/services/attachment_meta_cache"
    );

    clear_attachment_meta_cache();
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_attachment_preview_cache } = await import(
      "@/services/attachment_preview_cache"
    );

    clear_attachment_preview_cache();
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { request_cache } = await import("@/services/api/request_cache");

    request_cache.invalidate("GET:/mail/v1/messages");
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  try {
    const { clear_folder_context } = await import("@/services/folder_context");

    clear_folder_context();
  } catch (caught) {
    ignore_error("services/locked_folders:purge_locked_folder_local_caches", caught);
  }

  await Promise.allSettled(tasks);
}
