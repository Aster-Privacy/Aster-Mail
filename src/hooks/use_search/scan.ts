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



import {
  
  
  
  type MailItem,
} from "@/services/api/mail";
import { } from "@/services/locked_folders";
import { } from "@/workers/pgp_decrypt_pool";
import { } from "@/services/crypto/secure_memory";
import { } from "@/lib/html_sanitizer";
import { } from "@/utils/preview_text";
import { } from "@/lib/utils";
import { } from "@/utils/forwarding_alias";
import { } from "@/contexts/auth_context";
import { } from "@/lib/i18n/context";
import { } from "@/contexts/preferences_context";
import {
  
  
  
  
  open_snapshot_reader,
  
  
  
  
  
  
  
} from "@/services/search_index_store";
import { } from "@/hooks/mail_events";

import { cached_index } from "./index_cache";
import { CachedIndex, DecryptedIndexEntry, IndexPerson, ScanOptions } from "./types";
export async function scan_search_index(
  index: CachedIndex,
  visit: (item: MailItem, entry: DecryptedIndexEntry) => boolean,
  is_aborted: () => boolean,
  options?: ScanOptions,
): Promise<boolean> {
  for (const item of index.items) {
    const entry = index.decrypted.get(item.id);

    if (!entry) continue;
    if (!visit(item, entry)) return true;
  }

  options?.on_chunk?.();

  if (index.disk_chunk_ids.length === 0) return false;

  const reader = await open_snapshot_reader(index.user_email);

  if (!reader) return false;

  const skip = options?.skip ?? null;
  const summaries = skip?.uses_summary
    ? await reader.read_summaries(index.disk_chunk_ids)
    : null;

  for (const chunk_id of index.disk_chunk_ids) {
    if (is_aborted()) return true;

    if (summaries) {
      const summary = summaries.get(chunk_id);

      if (summary && skip!.skip_by_summary(summary)) continue;
    }

    if (skip?.uses_grams) {
      const filter = await reader.read_grams(chunk_id);

      if (filter && skip.skip_by_grams(filter)) continue;
    }

    const chunk = await reader.read(chunk_id);

    if (!chunk) continue;

    const entries = new Map<string, DecryptedIndexEntry>();

    for (const entry of chunk.entries) {
      entries.set(entry.id, entry);
    }

    let stopped = false;

    for (const item of chunk.items) {
      const entry = entries.get(item.id);

      if (!entry) continue;
      if (!visit(item, entry)) {
        stopped = true;
        break;
      }
    }

    entries.clear();

    if (stopped) return true;

    options?.on_chunk?.();

    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return false;
}

export function list_index_people(
  direction: "from" | "to",
  limit = 200,
): IndexPerson[] {
  if (!cached_index) return [];

  const by_email = new Map<string, IndexPerson>();

  const track = (name: string, email: string) => {
    const clean_email = (email || "").trim().toLowerCase();

    if (!clean_email || !clean_email.includes("@")) return;

    const existing = by_email.get(clean_email);

    if (existing) {
      existing.count++;
      if (!existing.name && name) existing.name = name.trim();

      return;
    }

    by_email.set(clean_email, {
      name: (name || "").trim(),
      email: clean_email,
      count: 1,
    });
  };

  for (const item of cached_index.items) {
    const envelope = cached_index.decrypted.get(item.id)?.envelope;

    if (!envelope) continue;

    if (direction === "from") {
      track(envelope.from?.name || "", envelope.from?.email || "");
      continue;
    }

    for (const recipient of envelope.to || []) {
      track(recipient.name, recipient.email);
    }
    for (const recipient of envelope.cc || []) {
      track(recipient.name, recipient.email);
    }
  }

  return Array.from(by_email.values())
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email))
    .slice(0, limit);
}

