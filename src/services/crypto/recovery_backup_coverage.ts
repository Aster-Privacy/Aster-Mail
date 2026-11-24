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
import type { EncryptedVault } from "./key_manager_core";

import { array_to_base64 } from "./base64";
import { collect_vault_key_fingerprints } from "./vault_key_fingerprints";

const COVERAGE_KEY_PREFIX = "aster_recovery_backup_keys:";
const MAX_COVERAGE_MARKS = 512;

export type RecoveryBackupCoverage =
  "covered" | "uncovered" | "would_shrink" | "unknown";

function coverage_key(user_id: string): string {
  return `${COVERAGE_KEY_PREFIX}${user_id}`;
}

async function signed_prekey_mark(public_key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`signed_prekey:${public_key}`) as BufferSource,
  );

  return array_to_base64(new Uint8Array(digest));
}

export async function backup_key_fingerprints_of(
  vault: EncryptedVault,
): Promise<string[]> {
  try {
    return await collect_vault_key_fingerprints(vault);
  } catch {
    return [];
  }
}

export async function inbound_key_marks(
  vault: EncryptedVault,
): Promise<string[]> {
  const marks = await backup_key_fingerprints_of(vault);

  if (marks.length === 0) return [];

  const signed_prekeys = [
    vault.ratchet_signed_prekey_public,
    ...(vault.ratchet_previous_keys ?? []).map(
      (previous) => previous.ratchet_signed_prekey_public,
    ),
  ];

  for (const signed_prekey of signed_prekeys) {
    if (marks.length >= MAX_COVERAGE_MARKS) break;
    if (typeof signed_prekey !== "string" || !signed_prekey) continue;

    const mark = await signed_prekey_mark(signed_prekey);

    if (!marks.includes(mark)) marks.push(mark);
  }

  return marks;
}

export function read_recovery_backup_coverage(
  user_id: string,
): string[] | null {
  if (!user_id) return null;

  try {
    const raw = globalThis.localStorage?.getItem(coverage_key(user_id));

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return null;

    return parsed.filter(
      (mark): mark is string => typeof mark === "string" && mark.length > 0,
    );
  } catch {
    return null;
  }
}

export function write_recovery_backup_coverage(
  user_id: string,
  marks: string[],
): void {
  if (!user_id) return;

  try {
    globalThis.localStorage?.setItem(
      coverage_key(user_id),
      JSON.stringify(marks.slice(0, MAX_COVERAGE_MARKS)),
    );
  } catch {
    return;
  }
}

export function classify_recovery_backup_coverage(
  marks: string[],
  recorded: string[] | null,
): RecoveryBackupCoverage {
  if (marks.length === 0) return "unknown";
  if (recorded === null) return "uncovered";

  const held = new Set(marks);

  if (recorded.some((mark) => !held.has(mark))) return "would_shrink";

  const covered = new Set(recorded);

  return marks.every((mark) => covered.has(mark)) ? "covered" : "uncovered";
}
