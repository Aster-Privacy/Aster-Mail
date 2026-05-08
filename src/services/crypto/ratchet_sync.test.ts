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

vi.mock("@/services/api/client", () => {
  return {
    api_client: {
      post: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

vi.mock("./double_ratchet", () => ({
  DoubleRatchet: { deserialize: vi.fn() },
  save_ratchet_state: vi.fn(),
  load_ratchet_state: vi.fn(),
  list_ratchet_conversations: vi.fn(),
}));

import { api_client } from "@/services/api/client";
import { sync_ratchet_to_server } from "./ratchet_sync";

const mock_post = api_client.post as unknown as ReturnType<typeof vi.fn>;
const mock_put = api_client.put as unknown as ReturnType<typeof vi.fn>;
const mock_get = api_client.get as unknown as ReturnType<typeof vi.fn>;

function make_fake_ratchet(conversation_id: string) {
  return {
    serialize: vi.fn().mockResolvedValue({ stub: true }),
    get_conversation_id: () => conversation_id,
  } as unknown as Parameters<typeof sync_ratchet_to_server>[0];
}

async function make_fake_key(): Promise<CryptoKey> {
  const raw = new Uint8Array(32);

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function ok_response(version: number) {
  return {
    data: {
      id: "1",
      conversation_id: "x",
      encrypted_state: "x",
      state_nonce: "x",
      state_version: version,
      updated_at: "now",
    },
  };
}

function err_response(code: string, error: string) {
  return { error, code };
}

function not_found() {
  return { error: "not found", code: "NOT_FOUND" };
}

describe("sync_ratchet_to_server", () => {
  beforeEach(() => {
    mock_post.mockReset();
    mock_put.mockReset();
    mock_get.mockReset();
  });

  it("new state: GET 404 then POST succeeds", async () => {
    mock_get.mockResolvedValueOnce(not_found());
    mock_post.mockResolvedValueOnce(ok_response(1));

    const ratchet = make_fake_ratchet("conv-happy");
    const key = await make_fake_key();

    const v = await sync_ratchet_to_server(ratchet, key);

    expect(v).toBe(1);
    expect(mock_get).toHaveBeenCalledTimes(1);
    expect(mock_post).toHaveBeenCalledTimes(1);
    expect(mock_put).not.toHaveBeenCalled();
  });

  it("existing state: GET returns version, then PUT", async () => {
    mock_get.mockResolvedValueOnce(ok_response(7));
    mock_put.mockResolvedValueOnce(ok_response(8));

    const ratchet = make_fake_ratchet("conv-existing");
    const key = await make_fake_key();

    const v = await sync_ratchet_to_server(ratchet, key);

    expect(v).toBe(8);
    expect(mock_post).not.toHaveBeenCalled();
    expect(mock_put).toHaveBeenCalledTimes(1);
    expect(mock_put.mock.calls[0][1].expected_version).toBe(7);
  });

  it("409 on PUT triggers re-GET and retry", async () => {
    mock_get.mockResolvedValueOnce(ok_response(3));
    mock_put.mockResolvedValueOnce(err_response("CONFLICT", "version"));
    mock_get.mockResolvedValueOnce(ok_response(5));
    mock_put.mockResolvedValueOnce(ok_response(6));

    const ratchet = make_fake_ratchet("conv-conflict");
    const key = await make_fake_key();

    const v = await sync_ratchet_to_server(ratchet, key);

    expect(v).toBe(6);
    expect(mock_put).toHaveBeenCalledTimes(2);
    expect(mock_put.mock.calls[0][1].expected_version).toBe(3);
    expect(mock_put.mock.calls[1][1].expected_version).toBe(5);
  });

  it("repeated 409 with no version progression eventually throws", async () => {
    mock_get.mockResolvedValue(ok_response(2));
    mock_put.mockResolvedValue(err_response("CONFLICT", "version"));

    const ratchet = make_fake_ratchet("conv-stuck");
    const key = await make_fake_key();

    await expect(sync_ratchet_to_server(ratchet, key)).rejects.toThrow();
    expect(mock_post).not.toHaveBeenCalled();
  });

  it("uses cached server version on subsequent calls (no GET)", async () => {
    mock_get.mockResolvedValueOnce(not_found());
    mock_post.mockResolvedValueOnce(ok_response(1));

    const ratchet = make_fake_ratchet("conv-cache");
    const key = await make_fake_key();

    await sync_ratchet_to_server(ratchet, key);

    mock_put.mockResolvedValueOnce(ok_response(2));

    const v = await sync_ratchet_to_server(ratchet, key);

    expect(v).toBe(2);
    expect(mock_get).toHaveBeenCalledTimes(1);
    expect(mock_put).toHaveBeenCalledTimes(1);
    expect(mock_put.mock.calls[0][1].expected_version).toBe(1);
  });

  it("concurrent calls for same conversation serialize via lock", async () => {
    const order: string[] = [];

    mock_get.mockResolvedValueOnce(not_found());
    mock_post.mockImplementationOnce(async () => {
      order.push("post1-start");
      await new Promise((r) => setTimeout(r, 30));
      order.push("post1-end");

      return ok_response(1);
    });

    mock_put.mockImplementationOnce(async () => {
      order.push("put2-start");

      return ok_response(2);
    });

    const ratchet = make_fake_ratchet("conv-lock");
    const key = await make_fake_key();

    const a = sync_ratchet_to_server(ratchet, key);
    const b = sync_ratchet_to_server(ratchet, key);

    await Promise.all([a, b]);

    expect(order).toEqual(["post1-start", "post1-end", "put2-start"]);
  });

  it("never calls POST when state already exists (no spurious 400)", async () => {
    mock_get.mockResolvedValueOnce(ok_response(10));
    mock_put.mockResolvedValueOnce(ok_response(11));

    const ratchet = make_fake_ratchet("conv-no-post");
    const key = await make_fake_key();

    await sync_ratchet_to_server(ratchet, key);

    expect(mock_post).not.toHaveBeenCalled();
  });
});
