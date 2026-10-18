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
  read_sync_floor: vi.fn(async (id: string) => floors.get(id) ?? 0),
  raise_sync_floor: vi.fn(async (id: string, version: number) => {
    floors.set(id, Math.max(floors.get(id) ?? 0, version));
  }),
}));

import {
  load_ratchet_from_server,
  sync_all_ratchet_states,
  sync_ratchet_to_server,
} from "./ratchet_sync";
import { DoubleRatchet } from "./double_ratchet";
import {
  list_ratchet_conversations,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";
import { array_to_base64, base64_to_array } from "./base64";

import { api_client } from "@/services/api/client";

const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_deserialize = DoubleRatchet.deserialize as unknown as ReturnType<
  typeof vi.fn
>;
const mock_list_local = list_ratchet_conversations as unknown as ReturnType<
  typeof vi.fn
>;
const mock_load_local = load_ratchet_state as unknown as ReturnType<
  typeof vi.fn
>;
const mock_save = save_ratchet_state as unknown as ReturnType<typeof vi.fn>;

const ANDROID_NONCE = "ZGVmZ2hpamtsbW5v";
const ANDROID_SEAL_BODY =
  "MzmtEhidM7wEGX2LtQscmDCxZ37iA50tzrWOctnAyibixCHiYDD/bKKYHUaNI6O9OWHjxVA/I0STkvO9iviHsCr8rmz0Zxl27gyfJmXVWoMdWiUW1KDu5KLdFLYUfDoO5RTrXFFvyhHcjvzpgH7dhkZ07XqyCthT1yb9xLfWbbUQpayES0AnSL8WO2D68z3l85iTMz0p4+ATq05hwmHXn+ZYSCnjg4KICjHPqIARzanime+TB59wqghuciDgui/i6Fxtg9hlEWUdEg4QNluVbR8j83v0ejbmrzQgoomXYoIhSYDBk6kJXWjJPaXNMd+wJPQ9m9/mmLujkW4ORmGb71VJuv1RC/e5036z9ovHannH5RJDwR1KR7osKCRCG2Zf8YdsBRs6y40S6z/zndXsnjds";
const ANDROID_LEGACY_SEAL = `${ANDROID_SEAL_BODY}uTXBEcVbEtSoNG0UJ376Rw==`;
const ANDROID_BOUND_SEAL = `${ANDROID_SEAL_BODY}HnxUmBPw6HstZ0pK+dP1uA==`;
const ANDROID_CONVERSATION = "conv-a";
const ANDROID_SYNC_VERSION = 50;
const FAR_FUTURE = 9_000_000_000_000;

async function vector_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).map((_, index) => index),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
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
  key: CryptoKey,
  body: { encrypted_state: string; state_nonce: string },
): Promise<Record<string, unknown>> {
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64_to_array(body.state_nonce) },
    key,
    base64_to_array(body.encrypted_state),
  );

  return JSON.parse(new TextDecoder().decode(opened));
}

function fake_ratchet(conversation_id: string) {
  return {
    serialize: vi.fn().mockResolvedValue({
      state: { root_key: "local" },
      conversation_id,
    }),
    get_conversation_id: () => conversation_id,
    mark_synced: vi.fn(),
  } as unknown as Parameters<typeof sync_ratchet_to_server>[0];
}

describe("synced ratchet state container", () => {
  beforeEach(() => {
    floors.clear();
    mock_get.mockReset();
    mock_put.mockReset();
    mock_post.mockReset();
    mock_deserialize.mockReset();
    mock_list_local.mockReset();
    mock_load_local.mockReset();
    mock_save.mockReset();
    mock_deserialize.mockImplementation(() => ({ mark_synced: vi.fn() }));
  });

  it("reads the container another client seals without associated data", async () => {
    mock_get.mockResolvedValueOnce(
      state_response(ANDROID_CONVERSATION, ANDROID_LEGACY_SEAL, ANDROID_NONCE),
    );

    const loaded = await load_ratchet_from_server(
      ANDROID_CONVERSATION,
      await vector_key(),
    );

    expect(loaded?.version).toBe(3);

    const restored = mock_deserialize.mock.calls[0][0];

    expect(restored.conversation_id).toBe(ANDROID_CONVERSATION);
    expect(restored.state.root_key).toBe("root");
    expect(restored.state.send_message_number).toBe(4);
    expect(floors.get(ANDROID_CONVERSATION)).toBe(ANDROID_SYNC_VERSION);
  });

  it("reads the container sealed to its conversation", async () => {
    mock_get.mockResolvedValueOnce(
      state_response(ANDROID_CONVERSATION, ANDROID_BOUND_SEAL, ANDROID_NONCE),
    );

    await load_ratchet_from_server(ANDROID_CONVERSATION, await vector_key());

    expect(mock_deserialize.mock.calls[0][0].state.root_key).toBe("root");
    expect(floors.get(ANDROID_CONVERSATION)).toBe(ANDROID_SYNC_VERSION);
  });

  it("refuses a container served under another conversation", async () => {
    const key = await vector_key();

    for (const sealed of [ANDROID_LEGACY_SEAL, ANDROID_BOUND_SEAL]) {
      mock_get.mockResolvedValueOnce(
        state_response("conv-b", sealed, ANDROID_NONCE),
      );

      await expect(load_ratchet_from_server("conv-b", key)).rejects.toThrow();
    }

    expect(mock_deserialize).not.toHaveBeenCalled();
    expect(floors.has("conv-b")).toBe(false);
  });

  it("refuses a listed container that belongs to another conversation", async () => {
    mock_get.mockResolvedValueOnce({
      data: [state_response("conv-c", ANDROID_LEGACY_SEAL, ANDROID_NONCE).data],
    });
    mock_list_local.mockResolvedValue([]);

    const result = await sync_all_ratchet_states(await vector_key());

    expect(result.synced).toEqual([]);
    expect(result.errors.map((entry) => entry.conversation_id)).toEqual([
      "conv-c",
    ]);
    expect(mock_deserialize).not.toHaveBeenCalled();
  });

  it("refuses a version older than one this device has seen", async () => {
    floors.set(ANDROID_CONVERSATION, ANDROID_SYNC_VERSION + 1);
    mock_get.mockResolvedValueOnce(
      state_response(ANDROID_CONVERSATION, ANDROID_LEGACY_SEAL, ANDROID_NONCE),
    );

    await expect(
      load_ratchet_from_server(ANDROID_CONVERSATION, await vector_key()),
    ).rejects.toThrow();
    expect(mock_deserialize).not.toHaveBeenCalled();
  });

  it("writes a version above the floor that older readers can still open", async () => {
    const key = await vector_key();

    floors.set("conv-write", FAR_FUTURE);
    mock_put.mockResolvedValueOnce(state_response("conv-write", "x", "x", 8));

    await sync_ratchet_to_server(fake_ratchet("conv-write"), key, 7);

    const written = await open_legacy(key, mock_put.mock.calls[0][1]);

    expect(written).toEqual({
      state: { root_key: "local", conversation_id: "conv-write" },
      conversation_id: "conv-write",
      sync_version: FAR_FUTURE + 1,
    });
    expect(floors.get("conv-write")).toBe(FAR_FUTURE + 1);
  });

  it("writes above the version already on the server", async () => {
    const key = await vector_key();
    const remote = await seal(key, {
      state: { root_key: "remote" },
      conversation_id: "conv-ahead",
      sync_version: FAR_FUTURE,
    });

    mock_get.mockResolvedValueOnce(
      state_response(
        "conv-ahead",
        remote.encrypted_state,
        remote.state_nonce,
        7,
      ),
    );
    mock_put.mockResolvedValueOnce(state_response("conv-ahead", "x", "x", 8));

    await sync_ratchet_to_server(fake_ratchet("conv-ahead"), key);

    const written = await open_legacy(key, mock_put.mock.calls[0][1]);

    expect(written.sync_version).toBe(FAR_FUTURE + 1);
  });

  describe("rollback to a state without a version", () => {
    const CONV = "conv-rollback";

    function ratchet_state(root_key: string, send_message_number: number) {
      return {
        dh_keypair: { public_key: "pub", secret_key: "sec" },
        dh_remote_public: "remote",
        root_key,
        chain_key_send: `send-${root_key}`,
        chain_key_recv: `recv-${root_key}`,
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

    function local_ratchet(version = 1) {
      const serialized = {
        state: ratchet_state("current", 9),
        conversation_id: CONV,
      };

      return {
        serialize: vi.fn().mockResolvedValue(serialized),
        adopt_state: vi.fn(),
        mark_synced: vi.fn(),
        is_dirty_since_sync: () => false,
        get_state_version: () => version,
        get_conversation_id: () => CONV,
      };
    }

    async function unversioned_blob(key: CryptoKey) {
      return seal(key, {
        state: { ...ratchet_state("stale", 1), conversation_id: CONV },
        conversation_id: CONV,
      });
    }

    function listed_entry(
      body: { encrypted_state: string; state_nonce: string },
      version: number,
    ) {
      return {
        id: "1",
        conversation_id: array_to_base64(new TextEncoder().encode(CONV)),
        encrypted_state: body.encrypted_state,
        state_nonce: body.state_nonce,
        state_version: version,
        updated_at: "now",
      };
    }

    it("refuses a stale blob at a far future floor when loading", async () => {
      const key = await vector_key();
      const stale = await unversioned_blob(key);

      floors.set(CONV, FAR_FUTURE);
      mock_get.mockResolvedValueOnce(
        state_response(
          CONV,
          stale.encrypted_state,
          stale.state_nonce,
          Number.MAX_SAFE_INTEGER,
        ),
      );

      await expect(load_ratchet_from_server(CONV, key)).rejects.toThrow(
        /refused/,
      );
      expect(mock_deserialize).not.toHaveBeenCalled();
      expect(floors.get(CONV)).toBe(FAR_FUTURE);
    });

    it("refuses a stale blob over a local state when loading", async () => {
      const key = await vector_key();
      const stale = await unversioned_blob(key);

      mock_load_local.mockResolvedValue(local_ratchet());
      mock_get.mockResolvedValueOnce(
        state_response(CONV, stale.encrypted_state, stale.state_nonce, 99),
      );

      await expect(load_ratchet_from_server(CONV, key)).rejects.toThrow(
        /refused/,
      );
      expect(mock_deserialize).not.toHaveBeenCalled();
    });

    function expect_local_kept(merged: {
      state: Record<string, unknown>;
    }): void {
      expect(merged.state.root_key).toBe("current");
      expect(merged.state.chain_key_send).toBe("send-current");
      expect(merged.state.send_message_number).toBe(9);
      expect(merged.state.chain_key_recv).toBe("recv-current");
      expect(merged.state.recv_message_number).toBe(2);
    }

    it("never replaces local state with a stale blob during sync", async () => {
      const key = await vector_key();
      const stale = await unversioned_blob(key);
      const local = local_ratchet(1);

      floors.set(CONV, FAR_FUTURE);
      mock_list_local.mockResolvedValue([CONV]);
      mock_load_local.mockResolvedValue(local);
      mock_get.mockResolvedValueOnce({
        data: [listed_entry(stale, Number.MAX_SAFE_INTEGER)],
      });

      await sync_all_ratchet_states(key);

      expect(mock_deserialize).not.toHaveBeenCalled();
      for (const [merged] of local.adopt_state.mock.calls) {
        expect_local_kept(merged);
      }
      expect(floors.get(CONV)).toBe(FAR_FUTURE);
    });

    it("never replaces local state with a stale blob when no floor exists yet", async () => {
      const key = await vector_key();
      const stale = await unversioned_blob(key);
      const local = local_ratchet(1);

      mock_list_local.mockResolvedValue([CONV]);
      mock_load_local.mockResolvedValue(local);
      mock_get.mockResolvedValueOnce({ data: [listed_entry(stale, 50)] });

      await sync_all_ratchet_states(key);

      for (const [merged] of local.adopt_state.mock.calls) {
        expect_local_kept(merged);
      }
      expect(floors.has(CONV)).toBe(false);
    });

    it("takes the send chain forward from a mobile state without a version", async () => {
      const key = await vector_key();
      const mobile = await seal(key, {
        state: {
          ...ratchet_state("current", 20),
          chain_key_send: "send-mobile",
          recv_message_number: 0,
          chain_key_recv: "recv-rewound",
          skipped_message_keys: [
            {
              dh_public: "remote",
              message_number: 1,
              message_key: "replayed",
              timestamp: 50,
            },
          ],
          updated_at: 300,
          conversation_id: CONV,
        },
        conversation_id: CONV,
      });
      const local = local_ratchet(1);

      floors.set(CONV, FAR_FUTURE);
      mock_list_local.mockResolvedValue([CONV]);
      mock_load_local.mockResolvedValue(local);
      mock_get.mockResolvedValueOnce({ data: [listed_entry(mobile, 2)] });

      const result = await sync_all_ratchet_states(key);

      expect(result.errors).toEqual([]);
      expect(local.adopt_state).toHaveBeenCalledTimes(1);

      const merged = local.adopt_state.mock.calls[0][0];

      expect(merged.state.chain_key_send).toBe("send-mobile");
      expect(merged.state.send_message_number).toBe(20);
      expect(merged.state.chain_key_recv).toBe("recv-current");
      expect(merged.state.recv_message_number).toBe(2);
      expect(merged.state.skipped_message_keys).toEqual([]);
      expect(floors.get(CONV)).toBe(FAR_FUTURE);
    });

    it("absorbs a mobile state without a version before overwriting it", async () => {
      const key = await vector_key();
      const mobile = await seal(key, {
        state: {
          ...ratchet_state("current", 20),
          chain_key_send: "send-mobile",
          updated_at: 300,
          conversation_id: CONV,
        },
        conversation_id: CONV,
      });
      const local = local_ratchet(1);

      floors.set(CONV, FAR_FUTURE);
      mock_get.mockResolvedValue(
        state_response(CONV, mobile.encrypted_state, mobile.state_nonce, 7),
      );
      mock_put.mockResolvedValue({ data: { state_version: 8 } });
      mock_save.mockResolvedValue(undefined);

      await sync_ratchet_to_server(
        local as unknown as Parameters<typeof sync_ratchet_to_server>[0],
        key,
      );

      expect(local.adopt_state).toHaveBeenCalledTimes(1);

      const merged = local.adopt_state.mock.calls[0][0];

      expect(merged.state.chain_key_send).toBe("send-mobile");
      expect(merged.state.send_message_number).toBe(20);
      expect(merged.state.recv_message_number).toBe(2);
      expect(local.adopt_state.mock.invocationCallOrder[0]).toBeLessThan(
        mock_put.mock.invocationCallOrder[0],
      );
    });

    it("refuses a stale blob for a conversation missing locally once a floor exists", async () => {
      const key = await vector_key();
      const stale = await unversioned_blob(key);

      floors.set(CONV, FAR_FUTURE);
      mock_list_local.mockResolvedValue([]);
      mock_get.mockResolvedValueOnce({ data: [listed_entry(stale, 50)] });

      const result = await sync_all_ratchet_states(key);

      expect(result.synced).toEqual([]);
      expect(mock_deserialize).not.toHaveBeenCalled();
      expect(mock_save).not.toHaveBeenCalled();
    });

    it("refuses an old versioned state even when the server version is higher", async () => {
      const key = await vector_key();
      const old = await seal(key, {
        state: { ...ratchet_state("old", 1), conversation_id: CONV },
        conversation_id: CONV,
        sync_version: 10,
      });
      const local = local_ratchet(1);

      floors.set(CONV, FAR_FUTURE);
      mock_list_local.mockResolvedValue([CONV]);
      mock_load_local.mockResolvedValue(local);
      mock_get.mockResolvedValueOnce({
        data: [listed_entry(old, Number.MAX_SAFE_INTEGER)],
      });

      const result = await sync_all_ratchet_states(key);

      expect(result.errors.map((entry) => entry.conversation_id)).toEqual([
        CONV,
      ]);
      expect(local.adopt_state).not.toHaveBeenCalled();
      expect(mock_save).not.toHaveBeenCalled();
    });

    it("merges a newer bound state into local instead of replacing it", async () => {
      const key = await vector_key();
      const newer = await seal(key, {
        state: {
          ...ratchet_state("current", 4),
          recv_message_number: 7,
          chain_key_recv: "recv-ahead",
          updated_at: 200,
          conversation_id: CONV,
        },
        conversation_id: CONV,
        sync_version: FAR_FUTURE + 5,
      });
      const local = local_ratchet(1);

      floors.set(CONV, FAR_FUTURE);
      mock_list_local.mockResolvedValue([CONV]);
      mock_load_local.mockResolvedValue(local);
      mock_get.mockResolvedValueOnce({ data: [listed_entry(newer, 2)] });

      const result = await sync_all_ratchet_states(key);

      expect(result.errors).toEqual([]);
      expect(result.synced).toEqual([CONV]);
      expect(mock_deserialize).not.toHaveBeenCalled();
      expect(local.adopt_state).toHaveBeenCalledTimes(1);

      const merged = local.adopt_state.mock.calls[0][0];

      expect(merged.state.send_message_number).toBe(9);
      expect(merged.state.chain_key_send).toBe("send-current");
      expect(merged.state.recv_message_number).toBe(2);
      expect(merged.state.updated_at).toBe(200);
      expect(local.mark_synced).toHaveBeenCalledTimes(1);
      expect(mock_save).toHaveBeenCalledWith(local);
      expect(floors.get(CONV)).toBe(FAR_FUTURE + 5);
    });

    it("loads a bound state over a local state", async () => {
      const key = await vector_key();
      const bound = await seal(key, {
        state: { ...ratchet_state("current", 4), conversation_id: CONV },
        conversation_id: CONV,
        sync_version: FAR_FUTURE + 1,
      });

      floors.set(CONV, FAR_FUTURE);
      mock_load_local.mockResolvedValue(local_ratchet());
      mock_get.mockResolvedValueOnce(
        state_response(CONV, bound.encrypted_state, bound.state_nonce, 4),
      );

      const loaded = await load_ratchet_from_server(CONV, key);

      expect(loaded?.version).toBe(4);
      expect(mock_deserialize).toHaveBeenCalledTimes(1);
      expect(floors.get(CONV)).toBe(FAR_FUTURE + 1);
    });

    it("migrates a state without a version on first upgrade and sets a floor", async () => {
      const key = await vector_key();
      const legacy = await unversioned_blob(key);

      mock_load_local.mockResolvedValue(null);
      mock_get.mockResolvedValueOnce(
        state_response(CONV, legacy.encrypted_state, legacy.state_nonce, 1),
      );

      const loaded = await load_ratchet_from_server(CONV, key);

      expect(loaded?.version).toBe(1);
      expect(mock_deserialize.mock.calls[0][0].state.root_key).toBe("stale");
      expect(floors.get(CONV)).toBe(1);

      const replay = await unversioned_blob(key);

      mock_get.mockResolvedValueOnce(
        state_response(CONV, replay.encrypted_state, replay.state_nonce, 2),
      );

      await expect(load_ratchet_from_server(CONV, key)).rejects.toThrow(
        /refused/,
      );
    });

    it("migrates a listed state without a version for a new device", async () => {
      const key = await vector_key();
      const legacy = await unversioned_blob(key);

      mock_list_local.mockResolvedValue([]);
      mock_load_local.mockResolvedValue(null);
      mock_get.mockResolvedValueOnce({ data: [listed_entry(legacy, 1)] });

      const result = await sync_all_ratchet_states(key);

      expect(result.synced).toEqual([CONV]);
      expect(mock_save).toHaveBeenCalledTimes(1);
      expect(floors.get(CONV)).toBe(1);
    });
  });
});
