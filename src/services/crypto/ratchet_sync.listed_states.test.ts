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

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
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

import { sync_all_ratchet_states } from "./ratchet_sync";
import { DoubleRatchet } from "./double_ratchet";
import {
  list_ratchet_conversations,
  load_ratchet_state,
  save_ratchet_state,
} from "./ratchet_state_store";

import { api_client } from "@/services/api/client";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_decrypt = decrypt_aes_gcm_with_fallback as unknown as ReturnType<
  typeof vi.fn
>;
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

function encode_id(conversation_id: string): string {
  return btoa(conversation_id);
}

function listed(conversation_id: string, version: number, with_state = true) {
  return {
    id: conversation_id,
    conversation_id: encode_id(conversation_id),
    encrypted_state: with_state ? "AAAA" : undefined,
    state_nonce: with_state ? "AAAA" : undefined,
    state_version: version,
    updated_at: "now",
  };
}

function fake_ratchet(conversation_id: string, version = 0, dirty = false) {
  return {
    conversation_id,
    mark_synced: vi.fn(),
    is_dirty_since_sync: () => dirty,
    get_state_version: () => version,
    get_conversation_id: () => conversation_id,
  };
}

async function make_key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(32),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function state_fetches(): unknown[][] {
  return mock_get.mock.calls.filter((call) =>
    String(call[0]).includes("/state/"),
  );
}

describe("sync_all_ratchet_states with listed states", () => {
  beforeEach(() => {
    mock_get.mockReset();
    mock_put.mockReset();
    mock_post.mockReset();
    mock_decrypt.mockReset();
    mock_deserialize.mockReset();
    mock_list_local.mockReset();
    mock_load_local.mockReset();
    mock_save.mockReset();

    mock_decrypt.mockImplementation(async () =>
      new TextEncoder().encode(JSON.stringify({ stub: true })),
    );
    mock_deserialize.mockImplementation(() => fake_ratchet("restored"));
    mock_save.mockResolvedValue(undefined);
  });

  it("restores conversations missing locally without one request each", async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `conv-${index}`);

    mock_get.mockResolvedValue({ data: ids.map((id) => listed(id, 3)) });
    mock_list_local.mockResolvedValue([]);

    const result = await sync_all_ratchet_states(await make_key());

    expect(mock_get).toHaveBeenCalledTimes(1);
    expect(state_fetches()).toHaveLength(0);
    expect(mock_save).toHaveBeenCalledTimes(25);
    expect(result.synced.sort()).toEqual([...ids].sort());
    expect(result.errors).toEqual([]);
  });

  it("adopts a newer server state from the listing", async () => {
    const restored = fake_ratchet("conv-a", 5);

    mock_get.mockResolvedValue({ data: [listed("conv-a", 5)] });
    mock_list_local.mockResolvedValue(["conv-a"]);
    mock_load_local.mockResolvedValue(fake_ratchet("conv-a", 2));
    mock_deserialize.mockReturnValue(restored);

    const result = await sync_all_ratchet_states(await make_key());

    expect(state_fetches()).toHaveLength(0);
    expect(restored.mark_synced).toHaveBeenCalledTimes(1);
    expect(mock_save).toHaveBeenCalledWith(restored);
    expect(result.synced).toEqual(["conv-a"]);
  });

  it("leaves an up-to-date local state untouched", async () => {
    mock_get.mockResolvedValue({ data: [listed("conv-a", 2)] });
    mock_list_local.mockResolvedValue(["conv-a"]);
    mock_load_local.mockResolvedValue(fake_ratchet("conv-a", 2));

    const result = await sync_all_ratchet_states(await make_key());

    expect(mock_get).toHaveBeenCalledTimes(1);
    expect(mock_decrypt).not.toHaveBeenCalled();
    expect(mock_save).not.toHaveBeenCalled();
    expect(result.synced).toEqual([]);
  });

  it("falls back to a single fetch when the listing has no state", async () => {
    mock_get.mockImplementation(async (endpoint: string) => {
      if (endpoint.endsWith("/states")) {
        return { data: [listed("conv-old", 1, false)] };
      }

      return { data: listed("conv-old", 1) };
    });
    mock_list_local.mockResolvedValue([]);

    const result = await sync_all_ratchet_states(await make_key());

    expect(state_fetches()).toHaveLength(1);
    expect(result.synced).toEqual(["conv-old"]);
  });

  it("reports a state that fails to decrypt and keeps going", async () => {
    mock_get.mockResolvedValue({
      data: [listed("conv-bad", 1), listed("conv-good", 1)],
    });
    mock_list_local.mockResolvedValue([]);
    mock_decrypt.mockRejectedValueOnce(new Error("bad key"));

    const result = await sync_all_ratchet_states(await make_key());

    expect(result.errors.map((e) => e.conversation_id)).toEqual(["conv-bad"]);
    expect(result.synced).toEqual(["conv-good"]);
    expect(mock_save).toHaveBeenCalledTimes(1);
  });
});
