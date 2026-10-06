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
import { list_ratchet_conversations } from "./ratchet_state_store";
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
      state: { root_key: "local" },
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
});
