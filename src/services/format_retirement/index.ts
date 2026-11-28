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
import type { FormatMigrator } from "./migrator";
import type { CursorStore, RemainingCounts, RunnerDeps } from "./runner";
import type { EscrowPage } from "./migrators/escrow_unbound";
import type { FormatClassId } from "./switches";

import { run_format_migrations, reset_runner_state } from "./runner";
import { with_format_retired } from "./record";
import { build_remaining_report, REMAINING_REPORT_PATH } from "./report";
import { create_escrow_unbound_migrator } from "./migrators/escrow_unbound";
import { create_storage_password_v1_migrator } from "./migrators/storage_password_v1";
import {
  create_vault_unbound_migrator,
  type VaultBlobState,
} from "./migrators/vault_unbound";
import {
  mail_public_kek_migrator,
  recovery_escrow_legacy_migrator,
} from "./migrators/mirrors";

import { api_client } from "@/services/api/client";
import {
  get_password_v1_storage_kek_id,
  get_vault_from_memory,
  has_vault_in_memory_for,
} from "@/services/crypto/memory_key_store";
import {
  fetch_latest_vault,
  vault_passphrase,
  write_vault_merged,
} from "@/services/crypto/vault_cas_write";
import { vault_blob_is_bound } from "@/services/crypto/key_manager_pgp_vault";
import {
  own_vault_last_open_bound,
  vault_write_binds,
} from "@/services/crypto/vault_binding";
import { with_vault_write_lock_bounded } from "@/services/crypto/vault_write_lock";
import {
  derive_escrow_key_from_base,
  get_escrow_key,
} from "@/services/crypto/message_escrow";
import { decrypt_with_legacy_derived_keys } from "@/services/crypto/legacy_keks";
import {
  ESCROW_LIST_PATH,
  ESCROW_UPSERT_PATH,
} from "@/services/crypto/storage_rotation/steps_escrow";
import { ignore_error } from "@/lib/ignore_error";

const START_DELAY_MS = 20_000;
const IDLE_TIMEOUT_MS = 60_000;
const MARKER_LOCK_WAIT_MS = 15_000;

let generation = 0;
let active_user: string | null = null;
let cancel_timer: (() => void) | null = null;
const finished_users = new Set<string>();

async function list_escrow_page(
  cursor: string | null,
  limit: number,
): Promise<EscrowPage> {
  const query = new URLSearchParams({ paged: "true", limit: String(limit) });

  if (cursor) query.set("cursor", cursor);

  const response = await api_client.get<EscrowPage>(
    `${ESCROW_LIST_PATH}?${query.toString()}`,
    { skip_cache: true, skip_dedup: true },
  );

  if (!response.data) throw new Error("escrow list unavailable");

  return response.data;
}

async function server_vault_state(): Promise<VaultBlobState | null> {
  const passphrase = vault_passphrase();

  if (!passphrase) return null;

  const fetched = await fetch_latest_vault();

  if (fetched.kind !== "ok") return null;

  const bound = await vault_blob_is_bound(
    fetched.snapshot.encrypted_vault,
    fetched.snapshot.vault_nonce,
    passphrase,
  );

  return bound ? "bound" : "unbound";
}

async function rewrite_vault_bound(user_id: string): Promise<boolean> {
  return with_vault_write_lock_bounded(async () => {
    const vault = get_vault_from_memory();

    if (!vault || !has_vault_in_memory_for(user_id)) return false;

    const result = await write_vault_merged({ next: { ...vault }, user_id });

    return result.status === "written";
  }, MARKER_LOCK_WAIT_MS);
}

const CURSOR_KEY_PREFIX = "aster_format_cursor";

function cursor_key(user_id: string, id: FormatClassId): string {
  return `${CURSOR_KEY_PREFIX}:${user_id}:${id}`;
}

const local_cursor_store: CursorStore = {
  load(user_id, id) {
    try {
      return globalThis.localStorage?.getItem(cursor_key(user_id, id)) ?? null;
    } catch {
      return null;
    }
  },
  save(user_id, id, cursor) {
    try {
      const key = cursor_key(user_id, id);

      if (cursor === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, cursor);
    } catch {
      return;
    }
  },
};

function build_migrators(): FormatMigrator[] {
  return [
    mail_public_kek_migrator,
    recovery_escrow_legacy_migrator,
    create_storage_password_v1_migrator({
      v1_kek_id: get_password_v1_storage_kek_id,
    }),
    create_escrow_unbound_migrator({
      list_page: list_escrow_page,
      upsert: async (row) => {
        const response = await api_client.post(ESCROW_UPSERT_PATH, row);

        if (response.error) throw new Error("escrow upsert failed");
      },
      escrow_key: get_escrow_key,
      open_legacy_unbound: async (ciphertext, nonce) => {
        const opened = await decrypt_with_legacy_derived_keys(
          derive_escrow_key_from_base,
          ciphertext,
          nonce,
        );

        return opened ? new Uint8Array(opened) : null;
      },
    }),
    create_vault_unbound_migrator({
      writes_bound: () => vault_write_binds(true),
      last_open_bound: own_vault_last_open_bound,
      server_state: server_vault_state,
      rewrite: rewrite_vault_bound,
    }),
  ];
}

async function write_format_marker(
  user_id: string,
  id: FormatClassId,
  version: number,
): Promise<boolean> {
  return with_vault_write_lock_bounded(async () => {
    const vault = get_vault_from_memory();

    if (!vault || !has_vault_in_memory_for(user_id)) return false;

    const result = await write_vault_merged({
      next: {
        ...vault,
        format_retirements: with_format_retired(vault, id, version, Date.now()),
      },
      user_id,
    });

    return result.status === "written";
  }, MARKER_LOCK_WAIT_MS);
}

async function post_remaining(
  _user_id: string,
  remaining: RemainingCounts,
): Promise<void> {
  const body = build_remaining_report(remaining);

  if (body) await api_client.post(REMAINING_REPORT_PATH, body);
}

function live_deps(run_generation: number): RunnerDeps {
  return {
    get_vault: get_vault_from_memory,
    is_active: (user_id) =>
      run_generation === generation && has_vault_in_memory_for(user_id),
    write_marker: write_format_marker,
    report: post_remaining,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    cursor_store: local_cursor_store,
  };
}

function schedule_idle(work: () => void): () => void {
  let idle_handle: number | null = null;
  const timer = setTimeout(() => {
    const idle = globalThis.requestIdleCallback;

    if (typeof idle === "function") {
      idle_handle = idle(work, { timeout: IDLE_TIMEOUT_MS });
    } else {
      work();
    }
  }, START_DELAY_MS);

  return () => {
    clearTimeout(timer);
    if (idle_handle !== null) globalThis.cancelIdleCallback?.(idle_handle);
  };
}

export function start_format_retirement(user_id: string): void {
  if (active_user === user_id || finished_users.has(user_id)) return;

  stop_format_retirement();
  active_user = user_id;

  const run_generation = generation;

  cancel_timer = schedule_idle(() => {
    cancel_timer = null;
    run_format_migrations(user_id, live_deps(run_generation), {
      migrators: build_migrators(),
    })
      .then((summary) => {
        if (run_generation !== generation) return;
        if (!Object.values(summary.outcomes).includes("locked")) {
          finished_users.add(user_id);
        }
        active_user = null;
      })
      .catch((caught) => {
        if (run_generation === generation) active_user = null;
        ignore_error("services/format_retirement:run", caught);
      });
  });
}

export function stop_format_retirement(): void {
  generation += 1;
  cancel_timer?.();
  cancel_timer = null;
  active_user = null;
}

export function reset_format_retirement_session(): void {
  stop_format_retirement();
  finished_users.clear();
  reset_runner_state();
}
