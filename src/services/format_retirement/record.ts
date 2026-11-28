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
import type {
  EncryptedVault,
  FormatRetirements,
  MailLegacyRetiredMarker,
} from "@/services/crypto/key_manager_core";

import { FORMAT_CLASS_IDS, refusal_mode, type FormatClassId } from "./switches";

import {
  is_mail_legacy_retired,
  is_valid_retired_marker,
} from "@/services/crypto/mail_legacy_retirement";

export const FORMAT_RETIREMENTS_VERSION = 1;

const RECOVERY_ESCROW_BOUND_FORMAT = 2;

type RetirementVault = Pick<
  EncryptedVault,
  "format_retirements" | "mail_legacy_retired" | "escrow_format"
>;

const retired_in_memory = new Set<FormatClassId>();

export function is_format_class_id(raw: unknown): raw is FormatClassId {
  return (
    typeof raw === "string" &&
    (FORMAT_CLASS_IDS as readonly string[]).includes(raw)
  );
}

export function is_valid_format_retirements(
  raw: unknown,
): raw is FormatRetirements {
  if (!raw || typeof raw !== "object") return false;

  const record = raw as Record<string, unknown>;

  return (
    typeof record.v === "number" &&
    Number.isInteger(record.v) &&
    record.v >= FORMAT_RETIREMENTS_VERSION &&
    !!record.classes &&
    typeof record.classes === "object" &&
    !Array.isArray(record.classes)
  );
}

export function merge_format_retirements(
  ...records: unknown[]
): FormatRetirements | undefined {
  let version = 0;
  const classes: Record<string, MailLegacyRetiredMarker> = {};

  for (const record of records) {
    if (!is_valid_format_retirements(record)) continue;

    version = Math.max(version, record.v);

    for (const [id, entry] of Object.entries(record.classes)) {
      if (!is_valid_retired_marker(entry)) continue;

      const best = classes[id];

      if (!best || entry.v > best.v) classes[id] = { v: entry.v, at: entry.at };
    }
  }

  if (version === 0) return undefined;

  return { v: version, classes };
}

export function record_has_format(
  vault: Pick<EncryptedVault, "format_retirements"> | null | undefined,
  id: FormatClassId,
): boolean {
  if (!vault || !is_valid_format_retirements(vault.format_retirements)) {
    return false;
  }

  return is_valid_retired_marker(vault.format_retirements.classes[id]);
}

export function vault_retires_format(
  vault: RetirementVault | null | undefined,
  id: FormatClassId,
): boolean {
  if (!vault) return false;
  if (
    id === "mail_public_kek" &&
    is_valid_retired_marker(vault.mail_legacy_retired)
  ) {
    return true;
  }
  if (
    id === "recovery_escrow_legacy" &&
    vault.escrow_format === RECOVERY_ESCROW_BOUND_FORMAT
  ) {
    return true;
  }

  return record_has_format(vault, id);
}

export function with_format_retired(
  vault: Pick<EncryptedVault, "format_retirements">,
  id: FormatClassId,
  version: number,
  now: number,
): FormatRetirements {
  const merged = merge_format_retirements(vault.format_retirements, {
    v: FORMAT_RETIREMENTS_VERSION,
    classes: { [id]: { v: version, at: new Date(now).toISOString() } },
  });

  return merged ?? { v: FORMAT_RETIREMENTS_VERSION, classes: {} };
}

export function sync_format_retirements(
  vault: RetirementVault | null | undefined,
): void {
  retired_in_memory.clear();

  for (const id of FORMAT_CLASS_IDS) {
    if (vault_retires_format(vault, id)) retired_in_memory.add(id);
  }
}

export function reset_format_retirements(): void {
  retired_in_memory.clear();
}

export function is_format_retired(id: FormatClassId): boolean {
  if (id === "mail_public_kek" && is_mail_legacy_retired()) return true;

  return retired_in_memory.has(id);
}

export function is_format_hard_refused(id: FormatClassId): boolean {
  return refusal_mode(id) === "always";
}

export function is_format_refused(id: FormatClassId): boolean {
  const mode = refusal_mode(id);

  if (mode === "always") return true;
  if (mode === "accept") return false;

  return is_format_retired(id);
}
