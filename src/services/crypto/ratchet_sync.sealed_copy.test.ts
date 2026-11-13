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
import { describe, it, expect, vi, beforeEach } from "vitest";

const floors = vi.hoisted(() => new Map<string, number>());
const counters = vi.hoisted(() => new Map<string, number>());

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
  save_ratchet_state: vi.fn(async () => undefined),
  load_ratchet_state: vi.fn(),
  list_ratchet_conversations: vi.fn(),
  archive_ratchet_state: vi.fn(),
}));

vi.mock("./ratchet_sync_floor", () => ({
  read_sync_floor: vi.fn(async (id: string) => floors.get(id) ?? 0),
  raise_sync_floor: vi.fn(async (id: string, version: number) => {
    floors.set(id, Math.max(floors.get(id) ?? 0, version));
  }),
}));

vi.mock("./ratchet_sync_counter", () => ({
  read_sync_counter: vi.fn(
    async (prefix: string, id: string) => counters.get(prefix + id) ?? 0,
  ),
  raise_sync_counter: vi.fn(
    async (prefix: string, id: string, version: number) => {
      counters.set(
        prefix + id,
        Math.max(counters.get(prefix + id) ?? 0, version),
      );
    },
  ),
}));

import { load_ratchet_from_server, sync_ratchet_to_server } from "./ratchet_sync";
import { DoubleRatchet } from "./double_ratchet";
import { load_ratchet_state } from "./ratchet_state_store";
import { RATCHET_SYNC_SEALED_PREFIX } from "./storage_key_names";
import { array_to_base64 } from "./base64";

import { api_client } from "@/services/api/client";

const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_deserialize = DoubleRatchet.deserialize as unknown as ReturnType<
  typeof vi.fn
>;
const mock_load_local = load_ratchet_state as unknown as ReturnType<
  typeof vi.fn
>;

const CONV = "conv-sealed";
const SEALED_KEY = RATCHET_SYNC_SEALED_PREFIX + CONV;

interface SealedBody {
  encrypted_state: string;
  state_nonce: string;
}

async function sync_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).map((_, index) => index),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function ratchet_state(send_message_number: number) {
  return {
    dh_keypair: { public_key: "pub", secret_key: "sec" },
    dh_remote_public: "remote",
    root_key: "root",
    chain_key_send: "send",
    chain_key_recv: "recv",
    send_message_number,
    recv_message_number: 2,
    previous_chain_length: 0,
    epoch: 3,
    skipped_message_keys: [],
    version: 1,
    dirty_since_sync: false,
    created_at: 1,
    updated_at: 100,
  };
}

function local_ratchet() {
  return {
    serialize: vi.fn().mockResolvedValue({
      state: ratchet_state(9),
      conversation_id: CONV,
    }),
    adopt_state: vi.fn(),
    mark_synced: vi.fn(),
    get_conversation_id: () => CONV,
  };
}

function as_ratchet(ratchet: ReturnType<typeof local_ratchet>) {
  return ratchet as unknown as Parameters<typeof sync_ratchet_to_server>[0];
}

function state_response(body: SealedBody, version = 3) {
  return {
    data: {
      id: "1",
      conversation_id: array_to_base64(new TextEncoder().encode(CONV)),
      encrypted_state: body.encrypted_state,
      state_nonce: body.state_nonce,
      state_version: version,
      updated_at: "now",
    },
  };
}

async function seal_copy(
  key: CryptoKey,
  sync_version: number,
): Promise<SealedBody> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(
      JSON.stringify({
        state: { ...ratchet_state(4), conversation_id: CONV },
        conversation_id: CONV,
        sync_version,
      }),
    ),
  );

  return {
    encrypted_state: array_to_base64(new Uint8Array(sealed)),
    state_nonce: array_to_base64(nonce),
  };
}

async function upload_that_the_server_never_confirms(
  key: CryptoKey,
): Promise<SealedBody[]> {
  mock_get.mockResolvedValue({ code: "NOT_FOUND", error: "not found" });
  mock_post.mockResolvedValue({ error: "unavailable" });

  await expect(
    sync_ratchet_to_server(as_ratchet(local_ratchet()), key),
  ).rejects.toThrow();

  mock_get.mockReset();

  return mock_post.mock.calls.map((call) => call[1] as SealedBody);
}

describe("copies this device already sealed", () => {
  beforeEach(() => {
    floors.clear();
    counters.clear();
    mock_get.mockReset();
    mock_put.mockReset();
    mock_post.mockReset();
    mock_deserialize.mockReset();
    mock_load_local.mockReset();
    mock_deserialize.mockImplementation(() => ({ mark_synced: vi.fn() }));
  });

  it("refuses an older sealed copy that the server never confirmed", async () => {
    const key = await sync_key();
    const uploads = await upload_that_the_server_never_confirms(key);

    expect(uploads.length).toBeGreaterThan(1);
    expect(floors.get(CONV) ?? 0).toBe(0);

    mock_load_local.mockResolvedValue(local_ratchet());
    mock_get.mockResolvedValueOnce(state_response(uploads[0]));

    await expect(load_ratchet_from_server(CONV, key)).rejects.toThrow(
      /rolled_back/,
    );
    expect(mock_deserialize).not.toHaveBeenCalled();
  });

  it("still loads the newest copy this device sealed", async () => {
    const key = await sync_key();
    const uploads = await upload_that_the_server_never_confirms(key);

    mock_load_local.mockResolvedValue(local_ratchet());
    mock_get.mockResolvedValueOnce(
      state_response(uploads[uploads.length - 1]),
    );

    const loaded = await load_ratchet_from_server(CONV, key);

    expect(loaded?.version).toBe(3);
    expect(mock_deserialize).toHaveBeenCalledTimes(1);
  });

  it("gives every sealed copy a higher version than the one before", async () => {
    const key = await sync_key();

    await upload_that_the_server_never_confirms(key);
    const first = counters.get(SEALED_KEY) ?? 0;

    mock_post.mockReset();
    await upload_that_the_server_never_confirms(key);

    expect(first).toBeGreaterThan(0);
    expect(counters.get(SEALED_KEY) ?? 0).toBeGreaterThan(first);
  });

  it("still merges a copy from another device that is older than the last sealed copy", async () => {
    const key = await sync_key();
    const other_device = await seal_copy(key, 500);
    const ratchet = local_ratchet();

    counters.set(SEALED_KEY, 1000);
    mock_get.mockResolvedValueOnce(state_response(other_device, 7));
    mock_put.mockResolvedValueOnce(state_response(other_device, 8));

    await sync_ratchet_to_server(as_ratchet(ratchet), key);

    expect(ratchet.adopt_state).toHaveBeenCalledTimes(1);
    expect(mock_put).toHaveBeenCalledTimes(1);
  });

  it("still restores a conversation that this device no longer holds", async () => {
    const key = await sync_key();
    const other_device = await seal_copy(key, 500);

    counters.set(SEALED_KEY, 1000);
    mock_load_local.mockResolvedValue(null);
    mock_get.mockResolvedValueOnce(state_response(other_device));

    const loaded = await load_ratchet_from_server(CONV, key);

    expect(loaded?.version).toBe(3);
  });
});
