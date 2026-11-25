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
  list_imported_password_meta,
  update_attachment_meta,
  type AttachmentMetaItem,
  type ImportedPasswordMetaPage,
} from "./api/attachments";
import {
  array_to_base64,
  decrypt_envelope_with_bytes,
  encrypt_envelope_with_bytes,
} from "./crypto/envelope";
import { seal_attachment_meta_v2 } from "./crypto/attachment_meta_v2";

export type ImportedResealOutcome =
  | "rewritten"
  | "skipped"
  | "unreadable"
  | "failed";

export const IMPORTED_META_PAGE_SIZE = 100;
export const IMPORTED_META_PROBE_SIZE = 5;

const LISTING_ATTEMPTS = 3;
const META_NONCE_LENGTH = 12;

export async function list_imported_password_meta_page(
  after: string | undefined,
  limit: number = IMPORTED_META_PAGE_SIZE,
): Promise<ImportedPasswordMetaPage> {
  let last_error: unknown = null;

  for (let attempt = 0; attempt < LISTING_ATTEMPTS; attempt += 1) {
    try {
      const response = await list_imported_password_meta(after, limit);

      if (response.data) return response.data;

      last_error = new Error(
        response.error ?? "imported attachment listing failed",
      );
    } catch (caught) {
      last_error = caught;
    }
  }

  throw last_error ?? new Error("imported attachment listing failed");
}

export async function* imported_password_meta_rows(): AsyncGenerator<AttachmentMetaItem> {
  let after: string | undefined;

  for (;;) {
    const page = await list_imported_password_meta_page(after);

    for (const row of page.attachments ?? []) yield row;

    after = page.next_cursor ?? undefined;

    if (!after) return;
  }
}

async function open_meta_with(
  encrypted_meta: string,
  passphrase_bytes: Uint8Array,
): Promise<object | null> {
  try {
    const opened = await decrypt_envelope_with_bytes<unknown>(
      encrypted_meta,
      passphrase_bytes,
    );

    return opened && typeof opened === "object" ? opened : null;
  } catch {
    return null;
  }
}

async function sealed_body(
  meta: object,
  new_bytes: Uint8Array,
  kek: Uint8Array | null,
): Promise<{ encrypted_meta: string; meta_nonce: string }> {
  if (kek) return seal_attachment_meta_v2(meta, kek);

  return {
    encrypted_meta: (await encrypt_envelope_with_bytes(meta, new_bytes))
      .encrypted,
    meta_nonce: array_to_base64(
      crypto.getRandomValues(new Uint8Array(META_NONCE_LENGTH)),
    ),
  };
}

export async function reseal_imported_attachment_row(
  row: Pick<AttachmentMetaItem, "id" | "encrypted_meta">,
  old_bytes: Uint8Array,
  new_bytes: Uint8Array,
  kek: Uint8Array | null,
): Promise<ImportedResealOutcome> {
  if (!row.encrypted_meta) return "skipped";

  const meta = await open_meta_with(row.encrypted_meta, old_bytes);

  if (!meta) {
    const current = await open_meta_with(row.encrypted_meta, new_bytes);

    return current ? "skipped" : "unreadable";
  }

  try {
    const body = await sealed_body(meta, new_bytes, kek);
    const result = await update_attachment_meta(row.id, body);

    return result.error || !result.data ? "failed" : "rewritten";
  } catch {
    return "failed";
  }
}

export async function reseal_imported_attachments(
  old_bytes: Uint8Array,
  new_bytes: Uint8Array,
  kek: Uint8Array | null,
  on_outcome: (outcome: ImportedResealOutcome) => void,
): Promise<void> {
  try {
    for await (const row of imported_password_meta_rows()) {
      on_outcome(
        await reseal_imported_attachment_row(row, old_bytes, new_bytes, kek),
      );
    }
  } catch {
    on_outcome("failed");
  }
}

export async function imported_attachments_locked(
  passphrase_bytes: Uint8Array,
): Promise<boolean> {
  const page = await list_imported_password_meta_page(
    undefined,
    IMPORTED_META_PROBE_SIZE,
  );

  for (const row of page.attachments ?? []) {
    if (!row.encrypted_meta) continue;
    if (!(await open_meta_with(row.encrypted_meta, passphrase_bytes))) {
      return true;
    }
  }

  return false;
}
