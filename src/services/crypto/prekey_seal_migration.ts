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
import type { PrekeySealKind } from "./prekey_seal";

import { drop_server_ec_secret, reseal_server_ec_secrets } from "./ec_prekey_store";
import { has_vault_in_memory } from "./memory_key_store";
import {
  drop_server_pq_secret,
  reseal_server_pq_secrets,
} from "./pq_prekey_store";
import {
  create_prekey_seal_key,
  legacy_prekey_seals_retired,
  load_prekey_seal_key,
  prekey_seal_writes_ready,
  retire_legacy_prekey_seals,
} from "./prekey_seal";
import { replace_signed_prekey } from "./signed_prekey_rotation";

export const PREKEY_SEAL_MAX_OPEN_FAILURES = 3;

const FAILURES_STORAGE_KEY = "aster_prekey_seal_open_failures";

interface UnopenableRow {
  kind: PrekeySealKind;
  key_id: number;
}

let in_flight: Promise<boolean> | null = null;
let memory_failures: Record<string, number> = {};

function row_label(row: UnopenableRow): string {
  return `${row.kind}:${row.key_id}`;
}

function read_failures(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FAILURES_STORAGE_KEY);

    if (!raw) return { ...memory_failures };

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const counts: Record<string, number> = {};

    for (const [label, value] of Object.entries(parsed)) {
      if (Number.isSafeInteger(value) && (value as number) > 0) {
        counts[label] = value as number;
      }
    }

    return counts;
  } catch {
    return { ...memory_failures };
  }
}

function write_failures(counts: Record<string, number>): void {
  memory_failures = { ...counts };

  try {
    if (Object.keys(counts).length === 0) {
      localStorage.removeItem(FAILURES_STORAGE_KEY);
    } else {
      localStorage.setItem(FAILURES_STORAGE_KEY, JSON.stringify(counts));
    }
  } catch {
    return;
  }
}

export function reset_prekey_seal_open_failures(): void {
  write_failures({});
}

async function scan_server_rows(
  seal_key: CryptoKey | null,
): Promise<UnopenableRow[] | null> {
  const unopenable: UnopenableRow[] = [];
  const pq_done = await reseal_server_pq_secrets(seal_key, (key_id) =>
    unopenable.push({ kind: "pq", key_id }),
  );
  const ec_done = await reseal_server_ec_secrets(seal_key, (key_id) =>
    unopenable.push({ kind: "ec", key_id }),
  );

  return pq_done && ec_done ? unopenable : null;
}

async function drop_row(row: UnopenableRow): Promise<boolean> {
  return row.kind === "ec"
    ? drop_server_ec_secret(row.key_id)
    : drop_server_pq_secret(row.key_id);
}

async function upload_replacements(rows: UnopenableRow[]): Promise<boolean> {
  try {
    if (rows.some((row) => row.kind === "ec")) {
      const { replenish_ec_one_time_prekeys } = await import(
        "./ec_prekey_service"
      );

      await replenish_ec_one_time_prekeys();
    }

    if (rows.some((row) => row.kind === "pq")) {
      const { generate_and_upload_prekeys } = await import("./prekey_service");

      if (!(await generate_and_upload_prekeys(true))) return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function replace_rows(rows: UnopenableRow[]): Promise<boolean> {
  for (const row of rows) {
    if (!(await drop_row(row))) return false;
  }

  return rows.length === 0 || upload_replacements(rows);
}

async function rotate_after_lost_key(
  unopenable: UnopenableRow[],
): Promise<CryptoKey | null> {
  const seal_key = await create_prekey_seal_key();

  if (!seal_key) return null;

  const settled = await scan_server_rows(seal_key);

  if (!settled) return null;

  const still_unopenable = new Set(settled.map(row_label));
  const lost = unopenable.filter((row) =>
    still_unopenable.has(row_label(row)),
  );

  if (lost.length === 0) return seal_key;

  if (!(await replace_rows(lost))) return null;

  if (!(await replace_signed_prekey())) return null;

  return seal_key;
}

async function settle_unopenable(rows: UnopenableRow[]): Promise<boolean> {
  const counts = read_failures();
  const due: UnopenableRow[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const label = row_label(row);

    seen.add(label);
    counts[label] = (counts[label] ?? 0) + 1;

    if (counts[label] >= PREKEY_SEAL_MAX_OPEN_FAILURES) due.push(row);
  }

  for (const label of Object.keys(counts)) {
    if (!seen.has(label)) delete counts[label];
  }

  write_failures(counts);

  if (due.length === 0) return rows.length === 0;

  if (!(await replace_rows(due))) return false;

  for (const row of due) delete counts[row_label(row)];

  write_failures(counts);

  return due.length === rows.length;
}

async function run_migration(): Promise<boolean> {
  if (!has_vault_in_memory()) return false;

  if (!(await prekey_seal_writes_ready())) return true;

  let seal_key = await load_prekey_seal_key();

  if (seal_key && legacy_prekey_seals_retired()) return true;

  if (!seal_key) {
    const unopenable = await scan_server_rows(null);

    if (!unopenable) return false;

    seal_key =
      unopenable.length > 0
        ? await rotate_after_lost_key(unopenable)
        : await create_prekey_seal_key();

    if (!seal_key) return false;
  }

  const unopenable = await scan_server_rows(seal_key);

  if (!unopenable) return false;

  if (!(await settle_unopenable(unopenable))) return false;

  return retire_legacy_prekey_seals();
}

export function migrate_prekey_seals(): Promise<boolean> {
  if (!in_flight) {
    in_flight = run_migration()
      .catch(() => false)
      .finally(() => {
        in_flight = null;
      });
  }

  return in_flight;
}

export function start_prekey_seal_migration(): void {
  void migrate_prekey_seals();
}
