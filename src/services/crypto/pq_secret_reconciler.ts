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
import { api_client } from "@/services/api/client";
import { generate_and_upload_prekeys } from "@/services/crypto/prekey_service";
import { list_pq_secret_ids } from "@/services/crypto/pq_prekey_store";

const RECONCILER_ENABLED_FLAG = "astermail_pq_reconciler_enabled";
const RECONCILER_RAN_FLAG = "astermail_pq_reconciler_v1";
const RECONCILER_LOCK_FLAG = "astermail_pq_reconciler_lock";
const LOCK_TIMEOUT_MS = 30000;

function is_dev(): boolean {
  try {
    return Boolean(
      (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
    );
  } catch {
    return false;
  }
}

function is_enabled(): boolean {
  try {
    return localStorage.getItem(RECONCILER_ENABLED_FLAG) === "1";
  } catch {
    return false;
  }
}

function already_ran(): boolean {
  try {
    return localStorage.getItem(RECONCILER_RAN_FLAG) === "1";
  } catch {
    return true;
  }
}

function mark_ran(): void {
  try {
    localStorage.setItem(RECONCILER_RAN_FLAG, "1");
  } catch {
    /* best-effort */
  }
}

function try_acquire_lock(): boolean {
  try {
    const now = Date.now();
    const existing = localStorage.getItem(RECONCILER_LOCK_FLAG);

    if (existing) {
      const ts = parseInt(existing, 10);

      if (!Number.isNaN(ts) && now - ts < LOCK_TIMEOUT_MS) {
        return false;
      }
    }

    localStorage.setItem(RECONCILER_LOCK_FLAG, String(now));

    return true;
  } catch {
    return false;
  }
}

function release_lock(): void {
  try {
    localStorage.removeItem(RECONCILER_LOCK_FLAG);
  } catch {
    /* best-effort */
  }
}

async function fetch_server_pq_count(): Promise<number | null> {
  try {
    const response = await api_client.get<{
      one_time_prekeys: number;
      pq_prekeys: number;
    }>("/crypto/v1/keys/prekeys/count");

    if (response.error || !response.data) return null;

    return response.data.pq_prekeys;
  } catch {
    return null;
  }
}

async function count_local_pq_secrets(): Promise<number> {
  try {
    const ids = await list_pq_secret_ids();

    return ids.length;
  } catch {
    return 0;
  }
}

export async function reconcile_pq_secrets_with_server(): Promise<void> {
  if (!is_enabled()) return;
  if (already_ran()) return;
  if (!try_acquire_lock()) return;

  try {
    const server_count = await fetch_server_pq_count();

    if (server_count === null) return;

    const local_count = await count_local_pq_secrets();

    if (server_count <= local_count) {
      mark_ran();

      return;
    }

    if (is_dev()) {
      console.info(
        "[pq_reconciler] start: server=%d local=%d delta=%d",
        server_count,
        local_count,
        server_count - local_count,
      );
    }

    const ok = await generate_and_upload_prekeys(true);

    if (!ok) {
      if (is_dev()) {
        console.info("[pq_reconciler] regeneration failed");
      }

      return;
    }

    mark_ran();

    if (is_dev()) {
      console.info("[pq_reconciler] complete: fresh pq prekeys uploaded");
    }
  } catch (error) {
    if (is_dev()) {
      console.info("[pq_reconciler] aborted", error);
    }
  } finally {
    release_lock();
  }
}
