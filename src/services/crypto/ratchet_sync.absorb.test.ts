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

vi.mock("./ratchet_state_merge", () => ({
  merge_discards_local_epoch: vi.fn(() => false),
  merge_ratchet_states: vi.fn(
    (
      local: { state: Record<string, unknown> },
      remote: { state: Record<string, unknown> },
    ) => ({
      ...local,
      state: { ...remote.state, ...local.state, merged: true },
    }),
  ),
}));

import {
  RatchetStateUnreadableError,
  derive_ratchet_sync_key,
  load_ratchet_from_server,
  sync_ratchet_to_server,
  type RatchetSyncKey,
} from "./ratchet_sync";
import { DoubleRatchet } from "./double_ratchet";
import { save_ratchet_state } from "./ratchet_state_store";
import {
  ratchet_state_sync_aad,
  split_ratchet_state_payload,
} from "./ratchet_state_container";
import { array_to_base64, base64_to_array } from "./base64";

import { clear_legacy_keks_from_memory } from "@/services/crypto/legacy_keks";
import { api_client } from "@/services/api/client";

const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_deserialize = DoubleRatchet.deserialize as unknown as ReturnType<
  typeof vi.fn
>;
const mock_save = save_ratchet_state as unknown as ReturnType<typeof vi.fn>;

function raw_key(seed: number): Uint8Array {
  return new Uint8Array(32).map((_, index) => (index + seed) & 0xff);
}

async function account_key(seed: number): Promise<RatchetSyncKey> {
  return derive_ratchet_sync_key(raw_key(seed), "user-1");
}

function state_response(
  conversation_id: string,
  encrypted_state: string,
  state_nonce: string,
  version = 3,
) {
  return {
    data: {
      id: "1",
      conversation_id: array_to_base64(
        new TextEncoder().encode(conversation_id),
      ),
      encrypted_state,
      state_nonce,
      state_version: version,
      updated_at: "now",
    },
  };
}

async function seal(
  key: RatchetSyncKey,
  fields: Record<string, unknown>,
): Promise<{ encrypted_state: string; state_nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key.compat_key,
    new TextEncoder().encode(JSON.stringify(fields)),
  );

  return {
    encrypted_state: array_to_base64(new Uint8Array(sealed)),
    state_nonce: array_to_base64(nonce),
  };
}

async function open_sealed(
  key: RatchetSyncKey,
  conversation_id: string,
  body: { encrypted_state: string; state_nonce: string },
): Promise<Record<string, unknown>> {
  const payload = split_ratchet_state_payload(
    base64_to_array(body.encrypted_state),
  );

  if (!payload) throw new Error("not a v3 payload");

  const opened = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64_to_array(body.state_nonce),
      additionalData: ratchet_state_sync_aad(
        key.user_id,
        conversation_id,
        payload.header_bytes,
      ),
    },
    key.state_key,
    payload.ciphertext,
  );

  return JSON.parse(new TextDecoder().decode(opened));
}

function adoptable_ratchet(conversation_id: string) {
  let current = {
    state: { root_key: "local", local_only: true } as Record<string, unknown>,
    conversation_id,
  };

  return {
    serialize: vi.fn(async () => current),
    adopt_state: vi.fn((next: typeof current) => {
      current = next;
    }),
    get_conversation_id: () => conversation_id,
    mark_synced: vi.fn(),
  } as unknown as Parameters<typeof sync_ratchet_to_server>[0] & {
    adopt_state: ReturnType<typeof vi.fn>;
  };
}

describe("ratchet sync never overwrites a server state it has not absorbed", () => {
  beforeEach(() => {
    mock_get.mockReset();
    mock_put.mockReset();
    mock_post.mockReset();
    mock_deserialize.mockReset();
    mock_save.mockReset();
    mock_save.mockResolvedValue(undefined);
    mock_deserialize.mockImplementation(() => ({ mark_synced: vi.fn() }));
  });

  afterEach(() => {
    clear_legacy_keks_from_memory();
  });

  it("merges the server state into the local ratchet before writing", async () => {
    const key = await account_key(1);
    const remote = await seal(key, {
      state: { root_key: "remote", remote_only: true },
      conversation_id: "conv-merge",
      sync_version: 5,
    });
    const ratchet = adoptable_ratchet("conv-merge");

    mock_get.mockResolvedValueOnce(
      state_response("conv-merge", remote.encrypted_state, remote.state_nonce),
    );
    mock_put.mockResolvedValueOnce(state_response("conv-merge", "x", "x", 4));

    await sync_ratchet_to_server(ratchet, key);

    expect(ratchet.adopt_state).toHaveBeenCalledTimes(1);
    expect(mock_save).toHaveBeenCalled();

    const written = await open_sealed(
      key,
      "conv-merge",
      mock_put.mock.calls[0][1],
    );
    const written_state = written.state as Record<string, unknown>;

    expect(written_state.remote_only).toBe(true);
    expect(written_state.local_only).toBe(true);
    expect(written_state.merged).toBe(true);
    expect(written_state.conversation_id).toBe("conv-merge");
  });

  it("refuses to overwrite a server state no available key can open", async () => {
    const key = await account_key(1);
    const other = await account_key(99);
    const foreign = await seal(other, {
      state: { root_key: "foreign" },
      conversation_id: "conv-locked",
    });
    const ratchet = adoptable_ratchet("conv-locked");

    mock_get.mockResolvedValue(
      state_response(
        "conv-locked",
        foreign.encrypted_state,
        foreign.state_nonce,
      ),
    );

    await expect(sync_ratchet_to_server(ratchet, key)).rejects.toThrow();
    expect(mock_put).not.toHaveBeenCalled();
    expect(mock_post).not.toHaveBeenCalled();
    expect(ratchet.adopt_state).not.toHaveBeenCalled();
  });

  it("exposes a typed error for unreadable states", async () => {
    const key = await account_key(1);
    const other = await account_key(99);
    const foreign = await seal(other, {
      state: { root_key: "foreign" },
      conversation_id: "conv-typed",
    });

    mock_get.mockResolvedValueOnce(
      state_response(
        "conv-typed",
        foreign.encrypted_state,
        foreign.state_nonce,
      ),
    );

    await expect(
      load_ratchet_from_server("conv-typed", key),
    ).rejects.toBeInstanceOf(RatchetStateUnreadableError);
  });

  it("overwrites a readable server state that fails to decode", async () => {
    const key = await account_key(1);
    const garbage = await seal(key, {
      state: { root_key: "x" },
      conversation_id: "conv-other",
    });
    const ratchet = adoptable_ratchet("conv-bad");

    mock_get.mockResolvedValueOnce(
      state_response("conv-bad", garbage.encrypted_state, garbage.state_nonce),
    );
    mock_put.mockResolvedValueOnce(state_response("conv-bad", "x", "x", 4));

    await sync_ratchet_to_server(ratchet, key);

    expect(ratchet.adopt_state).not.toHaveBeenCalled();

    const written = await open_sealed(
      key,
      "conv-bad",
      mock_put.mock.calls[0][1],
    );

    expect(written.conversation_id).toBe("conv-bad");
  });
  async function written_state(conversation_id: string, epoch: number) {
    const key = await account_key(1);
    const ratchet = adoptable_ratchet(conversation_id);

    (ratchet.serialize as ReturnType<typeof vi.fn>).mockResolvedValue({
      state: { root_key: "local", epoch },
      conversation_id,
    });
    mock_get.mockResolvedValueOnce({ code: "NOT_FOUND", error: "not found" });
    mock_post.mockResolvedValueOnce(
      state_response(conversation_id, "x", "x", 1),
    );

    await sync_ratchet_to_server(ratchet, key);

    return mock_post.mock.calls[0][1] as {
      encrypted_state: string;
      state_nonce: string;
    };
  }

  it("reads back a state it wrote for this account", async () => {
    const body = await written_state("conv-round", 6);
    const header = split_ratchet_state_payload(
      base64_to_array(body.encrypted_state),
    )?.header;

    expect(header?.epoch).toBe(6);

    mock_get.mockResolvedValueOnce(
      state_response("conv-round", body.encrypted_state, body.state_nonce),
    );

    await load_ratchet_from_server("conv-round", await account_key(1));

    expect(mock_deserialize.mock.calls[0][0].state.root_key).toBe("local");
  });

  it("refuses a state written for another account", async () => {
    const body = await written_state("conv-user", 6);
    const other_user = await derive_ratchet_sync_key(raw_key(1), "user-2");

    mock_get.mockResolvedValueOnce(
      state_response("conv-user", body.encrypted_state, body.state_nonce),
    );

    await expect(
      load_ratchet_from_server("conv-user", other_user),
    ).rejects.toBeInstanceOf(RatchetStateUnreadableError);
    expect(mock_deserialize).not.toHaveBeenCalled();
  });

  it("refuses a state whose epoch header was changed", async () => {
    const body = await written_state("conv-epoch", 6);
    const bytes = base64_to_array(body.encrypted_state);

    bytes[11] ^= 0x01;

    mock_get.mockResolvedValueOnce(
      state_response("conv-epoch", array_to_base64(bytes), body.state_nonce),
    );

    await expect(
      load_ratchet_from_server("conv-epoch", await account_key(1)),
    ).rejects.toThrow();
    expect(mock_deserialize).not.toHaveBeenCalled();
  });

  it("refuses a state moved to another conversation", async () => {
    const body = await written_state("conv-from", 6);

    mock_get.mockResolvedValueOnce(
      state_response("conv-to", body.encrypted_state, body.state_nonce),
    );

    await expect(
      load_ratchet_from_server("conv-to", await account_key(1)),
    ).rejects.toThrow();
    expect(mock_deserialize).not.toHaveBeenCalled();
  });
});
