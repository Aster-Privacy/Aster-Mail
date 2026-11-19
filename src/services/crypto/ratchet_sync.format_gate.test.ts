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

const vault_state: { current: Record<string, unknown> | null } = {
  current: null,
};
const readiness = { ratchet_sync_v3_ready: false };

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./memory_key_store", async (import_original) => {
  const actual = await import_original<typeof import("./memory_key_store")>();

  return { ...actual, get_vault_from_memory: () => vault_state.current };
});

vi.mock("./double_ratchet", () => ({
  DoubleRatchet: { deserialize: vi.fn() },
}));

vi.mock("./ratchet_state_store", () => ({
  save_ratchet_state: vi.fn(async () => undefined),
  load_ratchet_state: vi.fn(async () => null),
  list_ratchet_conversations: vi.fn(),
  archive_ratchet_state: vi.fn(),
}));

vi.mock("./ratchet_sync_counter", () => ({
  read_sync_counter: vi.fn(async () => 0),
  raise_sync_counter: vi.fn(async () => undefined),
}));

import { reset_sync_format_readiness_cache } from "../api/sync_format_readiness";
import {
  derive_ratchet_encryption_key,
  derive_ratchet_sync_key,
  load_ratchet_from_server,
  sync_ratchet_to_server,
} from "./ratchet_sync";
import { read_sync_floor } from "./ratchet_sync_floor";
import { read_sync_counter } from "./ratchet_sync_counter";
import { DoubleRatchet } from "./double_ratchet";
import { array_to_base64, base64_to_array } from "./base64";

import {
  append_legacy_key_raw_bytes,
  clear_legacy_keks_from_memory,
} from "@/services/crypto/legacy_keks";
import { api_client } from "@/services/api/client";

const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_counter = read_sync_counter as unknown as ReturnType<typeof vi.fn>;
const mock_deserialize = DoubleRatchet.deserialize as unknown as ReturnType<
  typeof vi.fn
>;

const USER_ID = "user-1";
const READINESS_PATH = "/crypto/v1/ratchet/sync-format-readiness";
const EMPTY_BODY = { encrypted_state: "", state_nonce: "" };

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, index) => (index + seed) & 0xff);
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

async function open_legacy(
  body: { encrypted_state: string; state_nonce: string },
  key: CryptoKey,
): Promise<Record<string, unknown> | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(body.state_nonce) },
      key,
      base64_to_array(body.encrypted_state),
    );

    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
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

function serve(states: Record<string, unknown>) {
  mock_get.mockImplementation(async (path: string) => {
    if (path === READINESS_PATH) return { data: { ...readiness } };

    for (const [conversation_id, record] of Object.entries(states)) {
      const encoded = encodeURIComponent(
        array_to_base64(new TextEncoder().encode(conversation_id)),
      );

      if (path.endsWith(encoded)) return { data: record };
    }

    return { code: "NOT_FOUND", error: "not found" };
  });
}

function body_state(
  conversation_id: string,
  fields: Record<string, unknown>,
  sync_version: number,
) {
  return {
    state: {
      root_key: "remote",
      dh_keypair: { public_key: "dh-remote", private_key: "dh-remote-private" },
      dh_remote_public: "dh-peer",
      send_message_number: 0,
      recv_message_number: 0,
      skipped_message_keys: [],
      created_at: 1,
      updated_at: 5,
      conversation_id,
      ...fields,
    },
    conversation_id,
    sync_version,
  };
}

function local_ratchet(conversation_id: string, epoch = 2) {
  let current = {
    state: {
      root_key: "local",
      epoch,
      dh_keypair: { public_key: "dh-local", private_key: "dh-local-private" },
      dh_remote_public: "dh-peer",
      chain_key_send: "local-send",
      chain_key_recv: "local-recv",
      send_message_number: 1,
      recv_message_number: 1,
      skipped_message_keys: [],
      created_at: 1,
      updated_at: 10,
    } as Record<string, unknown>,
    conversation_id,
  };

  return {
    serialize: vi.fn(async () => current),
    adopt_state: vi.fn((next: typeof current) => {
      current = next;
    }),
    advance_send_chain_to: vi.fn(async (_target: number) => undefined),
    current_state: () => current,
    get_conversation_id: () => conversation_id,
    mark_synced: vi.fn(),
    is_dirty_since_sync: () => false,
    get_state_version: () => 1,
  };
}

type SyncTarget = Parameters<typeof sync_ratchet_to_server>[0];

describe("ratchet sync format and generation", () => {
  beforeEach(() => {
    vault_state.current = null;
    readiness.ratchet_sync_v3_ready = false;
    reset_sync_format_readiness_cache();
    mock_get.mockReset();
    mock_put.mockReset();
    mock_post.mockReset();
    mock_deserialize.mockReset();
    mock_counter.mockReset();
    mock_counter.mockResolvedValue(0);
    mock_deserialize.mockImplementation(() => ({ mark_synced: vi.fn() }));
    mock_post.mockImplementation(async () => ({
      data: { state_version: 1 },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clear_legacy_keks_from_memory();
  });

  it("writes the old format while the account is not ready", async () => {
    const key = await derive_ratchet_sync_key(raw_key(1), USER_ID);

    serve({});

    await sync_ratchet_to_server(
      local_ratchet("conv-ready") as unknown as SyncTarget,
      key,
    ).catch(() => null);

    expect(mock_post).toHaveBeenCalledTimes(1);

    const opened = await open_legacy(
      mock_post.mock.calls[0]?.[1] ?? EMPTY_BODY,
      key.compat_key,
    );

    expect(opened?.conversation_id).toBe("conv-ready");
  });

  it("counts the generation up from the floor on a fast clock", async () => {
    const key = await derive_ratchet_sync_key(raw_key(1), USER_ID);

    vi.spyOn(Date, "now").mockReturnValue(8_000_000_000_000);
    mock_counter.mockResolvedValue(5);
    serve({});

    await sync_ratchet_to_server(
      local_ratchet("conv-clock") as unknown as SyncTarget,
      key,
    ).catch(() => null);

    const opened = await open_legacy(
      mock_post.mock.calls[0]?.[1] ?? EMPTY_BODY,
      key.compat_key,
    );

    expect(opened?.sync_version).toBe(6);
  });

  it("refuses an old-format state once the vault records the new one", async () => {
    const key = await derive_ratchet_sync_key(raw_key(1), USER_ID);
    const replay = await seal_with(
      await derive_ratchet_encryption_key(raw_key(1)),
      body_state("conv-replay", { epoch: 3 }, 50),
    );

    vault_state.current = { ratchet_state_v2: true };
    serve({ "conv-replay": state_record("conv-replay", replay) });

    await load_ratchet_from_server("conv-replay", key).catch(() => null);

    expect(mock_deserialize).not.toHaveBeenCalled();
  });

  it("holds a fresh device to the floor stored in the vault", async () => {
    vault_state.current = { ratchet_sync_floors: { "conv-fresh": 120 } };

    await expect(read_sync_floor("conv-fresh")).resolves.toBe(120);
  });

  it("keeps the local chain keys when a retired copy at the same epoch is ahead", async () => {
    const key = await derive_ratchet_sync_key(raw_key(1), USER_ID);
    const retired = raw_key(42);

    await append_legacy_key_raw_bytes(retired);

    const racing = await seal_with(
      await derive_ratchet_encryption_key(retired),
      body_state(
        "conv-race",
        {
          epoch: 2,
          root_key: "local",
          dh_keypair: {
            public_key: "dh-local",
            private_key: "dh-local-private",
          },
          chain_key_send: "remote-send",
          chain_key_recv: "remote-recv",
          send_message_number: 9,
          recv_message_number: 4,
          updated_at: 20,
        },
        4,
      ),
    );
    const ratchet = local_ratchet("conv-race");

    serve({ "conv-race": state_record("conv-race", racing) });
    mock_put.mockResolvedValue({
      data: state_record("conv-race", racing, 4),
    });

    await sync_ratchet_to_server(ratchet as unknown as SyncTarget, key).catch(
      () => null,
    );

    const adopted = ratchet.current_state().state;

    expect(ratchet.adopt_state).toHaveBeenCalledTimes(1);
    expect(adopted.chain_key_send).toBe("local-send");
    expect(adopted.chain_key_recv).toBe("local-recv");
    expect(adopted.root_key).toBe("local");
    expect(adopted.recv_message_number).toBe(1);
    expect(ratchet.advance_send_chain_to).toHaveBeenCalledWith(9);
    expect(mock_put).toHaveBeenCalledTimes(1);
  });

  it("ignores a retired copy with other keys at the same epoch", async () => {
    const key = await derive_ratchet_sync_key(raw_key(1), USER_ID);
    const retired = raw_key(43);

    await append_legacy_key_raw_bytes(retired);

    const racing = await seal_with(
      await derive_ratchet_encryption_key(retired),
      body_state(
        "conv-fork",
        {
          epoch: 2,
          chain_key_send: "remote-send",
          send_message_number: 9,
          updated_at: 20,
        },
        4,
      ),
    );
    const ratchet = local_ratchet("conv-fork");

    serve({ "conv-fork": state_record("conv-fork", racing) });
    mock_put.mockResolvedValue({
      data: state_record("conv-fork", racing, 4),
    });

    await sync_ratchet_to_server(ratchet as unknown as SyncTarget, key).catch(
      () => null,
    );

    const kept = ratchet.current_state().state;

    expect(ratchet.adopt_state).not.toHaveBeenCalled();
    expect(kept.chain_key_send).toBe("local-send");
    expect(kept.root_key).toBe("local");
  });
});
