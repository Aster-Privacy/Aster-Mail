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
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api_client } from "@/services/api/client";
import {
  re_encrypt_collection,
  re_encrypt_identity_scoped_setting,
} from "./recovery_reencrypt";
import { array_to_base64, base64_to_array } from "./base64";

const HASH_ALG = "SHA-256";

async function random_aes_key(usages: KeyUsage[]): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));

  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function seal(
  key: CryptoKey,
  plaintext: string,
): Promise<{ encrypted: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

async function open(
  key: CryptoKey,
  encrypted: string,
  nonce: string,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64_to_array(nonce) },
    key,
    base64_to_array(encrypted),
  );

  return new TextDecoder().decode(plaintext);
}

async function identity_key_for(
  identity_key: string,
  suffix: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    HASH_ALG,
    new TextEncoder().encode(identity_key + suffix),
  );

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

describe("re_encrypt_collection", () => {
  beforeEach(() => {
    vi.mocked(api_client.get).mockReset();
    vi.mocked(api_client.put).mockReset();
  });

  it("re-encrypts every declared field pair so the new key opens the same plaintext", async () => {
    const old_key = await random_aes_key(["encrypt", "decrypt"]);
    const new_key = await random_aes_key(["encrypt", "decrypt"]);

    const name = await seal(old_key, "Work signature");
    const content = await seal(old_key, "<p>Regards</p>");

    const item = {
      id: "sig-1",
      encrypted_name: name.encrypted,
      name_nonce: name.nonce,
      encrypted_content: content.encrypted,
      content_nonce: content.nonce,
    };

    const updates: Record<string, string>[] = [];

    const ok = await re_encrypt_collection(
      [item],
      [
        ["encrypted_name", "name_nonce"],
        ["encrypted_content", "content_nonce"],
      ],
      old_key,
      new_key,
      async (_item, patch) => {
        updates.push(patch);
      },
    );

    expect(ok).toBe(true);
    expect(updates).toHaveLength(1);

    const patch = updates[0];

    expect(Object.keys(patch).sort()).toEqual([
      "content_nonce",
      "encrypted_content",
      "encrypted_name",
      "name_nonce",
    ]);

    expect(await open(new_key, patch.encrypted_name, patch.name_nonce)).toBe(
      "Work signature",
    );
    expect(
      await open(new_key, patch.encrypted_content, patch.content_nonce),
    ).toBe("<p>Regards</p>");
  });

  it("rotates the nonce rather than reusing the old one", async () => {
    const old_key = await random_aes_key(["encrypt", "decrypt"]);
    const new_key = await random_aes_key(["encrypt", "decrypt"]);
    const field = await seal(old_key, "value");

    const updates: Record<string, string>[] = [];

    await re_encrypt_collection(
      [{ encrypted_value: field.encrypted, value_nonce: field.nonce }],
      [["encrypted_value", "value_nonce"]],
      old_key,
      new_key,
      async (_item, patch) => {
        updates.push(patch);
      },
    );

    expect(updates[0].value_nonce).not.toBe(field.nonce);
    expect(updates[0].encrypted_value).not.toBe(field.encrypted);
  });

  it("isolates a failing item and still re-encrypts the rest", async () => {
    const old_key = await random_aes_key(["encrypt", "decrypt"]);
    const wrong_key = await random_aes_key(["encrypt", "decrypt"]);
    const new_key = await random_aes_key(["encrypt", "decrypt"]);

    const good = await seal(old_key, "recoverable");
    const bad = await seal(wrong_key, "undecryptable");

    const updated_ids: string[] = [];

    const ok = await re_encrypt_collection(
      [
        { id: "bad", encrypted_value: bad.encrypted, value_nonce: bad.nonce },
        { id: "good", encrypted_value: good.encrypted, value_nonce: good.nonce },
      ],
      [["encrypted_value", "value_nonce"]],
      old_key,
      new_key,
      async (item, _patch) => {
        updated_ids.push((item as { id: string }).id);
      },
    );

    expect(ok).toBe(false);
    expect(updated_ids).toEqual(["good"]);
  });

  it("reports failure when the update call rejects", async () => {
    const old_key = await random_aes_key(["encrypt", "decrypt"]);
    const new_key = await random_aes_key(["encrypt", "decrypt"]);
    const field = await seal(old_key, "value");

    const ok = await re_encrypt_collection(
      [{ encrypted_value: field.encrypted, value_nonce: field.nonce }],
      [["encrypted_value", "value_nonce"]],
      old_key,
      new_key,
      async () => {
        throw new Error("network down");
      },
    );

    expect(ok).toBe(false);
  });

  it("treats an empty collection as success without calling update", async () => {
    const old_key = await random_aes_key(["encrypt", "decrypt"]);
    const new_key = await random_aes_key(["encrypt", "decrypt"]);
    const update = vi.fn();

    const ok = await re_encrypt_collection(
      [],
      [["encrypted_value", "value_nonce"]],
      old_key,
      new_key,
      update,
    );

    expect(ok).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("re_encrypt_identity_scoped_setting", () => {
  const endpoint = "/core/v1/onboarding";
  const suffix = "astermail-onboarding-v1";
  const old_identity = "old-identity-key";
  const new_identity = "new-identity-key";

  beforeEach(() => {
    vi.mocked(api_client.get).mockReset();
    vi.mocked(api_client.put).mockReset();
    vi.mocked(api_client.put).mockResolvedValue({ data: {}, error: undefined });
  });

  it("rewrites the field under the new identity-derived key", async () => {
    const old_key = await identity_key_for(old_identity, suffix, ["encrypt"]);
    const sealed = await seal(old_key, '{"step":3}');

    vi.mocked(api_client.get).mockResolvedValue({
      data: { encrypted_state: sealed.encrypted, state_nonce: sealed.nonce },
      error: undefined,
    });

    await re_encrypt_identity_scoped_setting(
      endpoint,
      suffix,
      ["encrypted_state", "state_nonce"],
      old_identity,
      new_identity,
    );

    expect(api_client.put).toHaveBeenCalledTimes(1);

    const [called_endpoint, payload] = vi.mocked(api_client.put).mock
      .calls[0] as [string, Record<string, string>];

    expect(called_endpoint).toBe(endpoint);

    const new_key = await identity_key_for(new_identity, suffix, ["decrypt"]);

    expect(
      await open(new_key, payload.encrypted_state, payload.state_nonce),
    ).toBe('{"step":3}');
  });

  it("does nothing when the identity key is unchanged", async () => {
    await re_encrypt_identity_scoped_setting(
      endpoint,
      suffix,
      ["encrypted_state", "state_nonce"],
      old_identity,
      old_identity,
    );

    expect(api_client.get).not.toHaveBeenCalled();
    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("does nothing when the setting has no stored ciphertext", async () => {
    vi.mocked(api_client.get).mockResolvedValue({
      data: { encrypted_state: null, state_nonce: null },
      error: undefined,
    });

    await re_encrypt_identity_scoped_setting(
      endpoint,
      suffix,
      ["encrypted_state", "state_nonce"],
      old_identity,
      new_identity,
    );

    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("does nothing when the read fails", async () => {
    vi.mocked(api_client.get).mockResolvedValue({
      data: null,
      error: "boom",
    });

    await re_encrypt_identity_scoped_setting(
      endpoint,
      suffix,
      ["encrypted_state", "state_nonce"],
      old_identity,
      new_identity,
    );

    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("keeps each suffix in its own key domain", async () => {
    const old_key = await identity_key_for(old_identity, suffix, ["encrypt"]);
    const sealed = await seal(old_key, "secret");

    vi.mocked(api_client.get).mockResolvedValue({
      data: { encrypted_state: sealed.encrypted, state_nonce: sealed.nonce },
      error: undefined,
    });

    await re_encrypt_identity_scoped_setting(
      endpoint,
      suffix,
      ["encrypted_state", "state_nonce"],
      old_identity,
      new_identity,
    );

    const [, payload] = vi.mocked(api_client.put).mock.calls[0] as [
      string,
      Record<string, string>,
    ];

    const other_domain_key = await identity_key_for(
      new_identity,
      "astermail-devmode-v1",
      ["decrypt"],
    );

    await expect(
      open(other_domain_key, payload.encrypted_state, payload.state_nonce),
    ).rejects.toThrow();
  });
});
