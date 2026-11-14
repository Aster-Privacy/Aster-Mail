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
import type { EncryptedVault } from "../key_manager";
import type { ResealRunOptions, ResealRunResult } from "./run";
import type { ProgressStore, ResealProgress } from "./reseal_io";

import { zero_uint8_array } from "../secure_memory";

import { collect_old_storage_raws } from "./reseal_keys";
import { empty_counts } from "./reseal_io";
import { run_reseal_steps } from "./run";

import { ignore_error } from "@/lib/ignore_error";

const MARKER_DOMAIN = "astermail_legacy_key_sweep_v1";

type SweepVault = Pick<
  EncryptedVault,
  "data_kek" | "legacy_keks" | "storage_rekey" | "data_kek_random"
>;

export type LegacySweepOptions = Omit<ResealRunOptions, "finish" | "vault"> & {
  vault: SweepVault;
};

function has_old_keys(
  vault: SweepVault,
  extra: Uint8Array[] | undefined,
): boolean {
  const raws = collect_old_storage_raws(vault, extra);
  const found = raws.length > 0;

  raws.forEach(zero_uint8_array);

  return found;
}

export async function run_legacy_key_sweep(
  options: LegacySweepOptions,
): Promise<ResealRunResult> {
  const { vault } = options;
  const wanted =
    vault.data_kek_random === true &&
    !!vault.data_kek &&
    vault.storage_rekey?.state !== "pending" &&
    has_old_keys(vault, options.key_options?.extra_old_raws);

  if (!wanted) return { status: "not_needed", counts: empty_counts() };

  return run_reseal_steps({ ...options, finish: async () => "done" });
}

export async function legacy_sweep_marker(vault: SweepVault): Promise<string> {
  const legacy = [
    ...new Set((vault.legacy_keks ?? []).map((entry) => entry.k)),
  ].sort();
  const input = new TextEncoder().encode(
    [MARKER_DOMAIN, vault.data_kek ?? "", ...legacy].join("\n"),
  );

  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));

    return Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } finally {
    zero_uint8_array(input);
  }
}

interface StoredSweep {
  marker: string;
  progress: ResealProgress;
}

function read_json<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : null;
  } catch (caught) {
    ignore_error("services/crypto/storage_rotation:legacy_sweep_read", caught);

    return null;
  }
}

function write_value(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (caught) {
    ignore_error("services/crypto/storage_rotation:legacy_sweep_write", caught);
  }
}

export function legacy_sweep_progress_store(
  user_id: string,
  marker: string,
): ProgressStore {
  const key = `astermail_legacy_key_sweep_${user_id}`;

  return {
    load(): ResealProgress | null {
      const stored = read_json<Partial<StoredSweep>>(key);
      const progress = stored?.progress;

      if (stored?.marker !== marker || !progress) return null;
      if (typeof progress.key_id !== "string") return null;

      return {
        key_id: progress.key_id,
        steps:
          progress.steps && typeof progress.steps === "object"
            ? progress.steps
            : {},
        hash_moves: Array.isArray(progress.hash_moves)
          ? progress.hash_moves
          : [],
      };
    },
    save(progress: ResealProgress): void {
      write_value(key, JSON.stringify({ marker, progress }));
    },
    clear(): void {
      write_value(key, null);
    },
  };
}

function done_key(user_id: string): string {
  return `astermail_legacy_key_sweep_done_${user_id}`;
}

export function legacy_sweep_done(user_id: string, marker: string): boolean {
  try {
    return localStorage.getItem(done_key(user_id)) === marker;
  } catch {
    return false;
  }
}

export function mark_legacy_sweep_done(user_id: string, marker: string): void {
  write_value(done_key(user_id), marker);
}
