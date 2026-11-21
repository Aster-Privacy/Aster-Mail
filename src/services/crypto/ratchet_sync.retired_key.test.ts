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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./ratchet_sync_format", () => ({
  ratchet_sync_writes_bound: vi.fn(async () => true),
  vault_requires_bound_state: vi.fn(() => false),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./double_ratchet", () => ({
  DoubleRatchet: { deserialize: vi.fn() },
}));

vi.mock("./ratchet_state_store", () => ({
  save_ratchet_state: vi.fn(),
  load_ratchet_state: vi.fn(),
  list_ratchet_conversations: vi.fn(),
  archive_ratchet_state: vi.fn(),
}));

vi.mock("./ratchet_sync_floor", () => ({
  read_sync_floor: vi.fn(async () => 0),
  raise_sync_floor: vi.fn(async () => undefined),
}));

import {
  derive_ratchet_encryption_key,
  derive_ratchet_sync_key,
  load_ratchet_from_server,
  sync_all_ratchet_states,
  sync_ratchet_to_server,
  type RatchetSyncKey,
} from "./ratchet_sync";
import { DoubleRatchet } from "./double_ratchet";
import {
  list_ratchet_conversations,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";
import { array_to_base64 } from "./base64";

import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
} from "@/services/crypto/legacy_keks";
import { api_client } from "@/services/api/client";

const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_deserialize = DoubleRatchet.deserialize as unknown as ReturnType<
  typeof vi.fn
>;
const mock_save = save_ratchet_state as unknown as ReturnType<typeof vi.fn>;
const mock_list_local = list_ratchet_conversations as unknown as ReturnType<
  typeof vi.fn
>;
const mock_load_local = load_ratchet_state as unknown as ReturnType<
  typeof vi.fn
>;

const USER_ID = "user-1";
const PLANTED_EPOCH = 1_000_000_000;
const PLANTED_VERSION = 9_000_000_000_000;

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, index) => (index + seed) & 0xff);
}

async function device_key(): Promise<RatchetSyncKey> {
  return derive_ratchet_sync_key(raw_key(1), USER_ID);
}

async function raw_aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal_with(
  key: CryptoKey,
  fields: Record<string, unknown>,
): Promise<{ encrypted_state: string; state_nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(fields)),
  );

  return {
    encrypted_state: array_to_base64(new Uint8Array(sealed)),
    state_nonce: array_to_base64(nonce),
  };
}

function state_record(
  conversation_id: string,
  body: { encrypted_state: string; state_nonce: string },
  version = 3,
) {
  return {
    id: "1",
    conversation_id: array_to_base64(new TextEncoder().encode(conversation_id)),
    encrypted_state: body.encrypted_state,
    state_nonce: body.state_nonce,
    state_version: version,
    updated_at: "now",
  };
}

function planted_state(conversation_id: string) {
  return {
    state: {
      dh_keypair: { public_key: "server-pub", secret_key: "server-sec" },
      dh_remote_public: "server-remote",
      root_key: "planted",
      chain_key_send: "planted-send",
      chain_key_recv: "planted-recv",
      send_message_number: 0,
      recv_message_number: 0,
      previous_chain_length: 0,
      epoch: PLANTED_EPOCH,
      skipped_message_keys: [],
      version: 1,
      dirty_since_sync: false,
      created_at: 1,
      updated_at: PLANTED_VERSION,
      conversation_id,
    },
    conversation_id,
    sync_version: PLANTED_VERSION,
  };
}

async function retired_seals(conversation_id: string) {
  const retired = raw_key(42);

  await append_legacy_key_raw_bytes(retired);

  return {
    derived: await seal_with(
      await derive_ratchet_encryption_key(retired),
      planted_state(conversation_id),
    ),
    raw: await seal_with(
      await raw_aes_key(retired),
      planted_state(conversation_id),
    ),
  };
}

function local_ratchet(conversation_id: string) {
  let current = {
    state: {
      root_key: "local",
      epoch: 2,
      updated_at: 10,
    } as Record<string, unknown>,
    conversation_id,
  };

  return {
    serialize: vi.fn(async () => current),
    adopt_state: vi.fn((next: typeof current) => {
      current = next;
    }),
    get_conversation_id: () => conversation_id,
    mark_synced: vi.fn(),
    is_dirty_since_sync: () => false,
    get_state_version: () => 1,
  };
}

describe("synced ratchet state sealed under a retired key", () => {
  beforeEach(() => {
    mock_get.mockReset();
    mock_put.mockReset();
    mock_post.mockReset();
    mock_deserialize.mockReset();
    mock_save.mockReset();
    mock_list_local.mockReset();
    mock_load_local.mockReset();
    mock_save.mockResolvedValue(undefined);
    mock_load_local.mockResolvedValue(null);
    mock_deserialize.mockImplementation(() => ({ mark_synced: vi.fn() }));
  });

  afterEach(() => {
    clear_legacy_keks_from_memory();
  });

  it("never restores it on a device without the conversation", async () => {
    const key = await device_key();
    const seals = await retired_seals("conv-fresh");

    for (const body of [seals.derived, seals.raw]) {
      mock_get.mockResolvedValueOnce({
        data: state_record("conv-fresh", body),
      });

      await load_ratchet_from_server("conv-fresh", key).catch(() => null);
    }

    expect(mock_deserialize).not.toHaveBeenCalled();
    expect(mock_save).not.toHaveBeenCalled();
  });

  it("never lists it into a new device", async () => {
    const key = await device_key();
    const seals = await retired_seals("conv-listed");

    mock_list_local.mockResolvedValue([]);
    mock_get.mockResolvedValueOnce({
      data: [state_record("conv-listed", seals.derived)],
    });

    const result = await sync_all_ratchet_states(key);

    expect(result.synced).toEqual([]);
    expect(mock_deserialize).not.toHaveBeenCalled();
    expect(mock_save).not.toHaveBeenCalled();
  });

  it("keeps the local session and replaces the state on the server", async () => {
    const key = await device_key();
    const seals = await retired_seals("conv-local");

    for (const body of [seals.raw, seals.derived]) {
      const ratchet = local_ratchet("conv-local");

      mock_put.mockReset();
      mock_get.mockResolvedValueOnce({
        data: state_record("conv-local", body),
      });
      mock_put.mockResolvedValueOnce({
        data: state_record("conv-local", body, 4),
      });

      await sync_ratchet_to_server(
        ratchet as unknown as Parameters<typeof sync_ratchet_to_server>[0],
        key,
      ).catch(() => null);

      expect(ratchet.adopt_state).not.toHaveBeenCalled();
      expect(mock_put).toHaveBeenCalledTimes(1);
      expect(mock_put.mock.calls[0][1].encrypted_state).not.toBe(
        body.encrypted_state,
      );
    }
  });

  it("still reads a state that current clients seal under the current key", async () => {
    const key = await device_key();
    const current = await seal_with(
      await derive_ratchet_encryption_key(raw_key(1)),
      {
        state: { root_key: "from-phone", epoch: 4 },
        conversation_id: "conv-today",
        sync_version: 7,
      },
    );

    mock_get.mockResolvedValueOnce({
      data: state_record("conv-today", current),
    });

    await load_ratchet_from_server("conv-today", key);

    expect(mock_deserialize).toHaveBeenCalledTimes(1);
    expect(mock_deserialize.mock.calls[0][0].state.root_key).toBe(
      "from-phone",
    );
  });
});
