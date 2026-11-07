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
import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PASSPHRASE = "external key service passphrase";
const ADDRESS = "owner@astermail.org";

const h = vi.hoisted(() => ({
  owner: "user-a" as string | null,
  vault: { data_kek: "" } as { data_kek: string } | null,
  cache: new Map<string, unknown>(),
  put_results: [] as unknown[],
  on_challenge: null as null | (() => void),
  on_put: null as null | (() => void),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_vault_owner_id: () => h.owner,
  is_master_key_vault: (vault: { data_kek?: string } | null) =>
    !!vault?.data_kek,
  on_vault_cleared: vi.fn(() => () => {}),
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: async () => await import("openpgp"),
}));

vi.mock("@/services/api/account_key", () => ({
  get_account_key_capabilities: async () => ({ external_pgp_keys: true }),
}));

vi.mock("@/services/crypto/external_pgp_cache", () => ({
  read_cached_external_key: async (user_id: string) =>
    h.cache.get(user_id) ?? null,
  write_cached_external_key: async (record: { user_id: string }) => {
    h.cache.set(record.user_id, record);
  },
  remove_cached_external_key: async (user_id: string) => {
    h.cache.delete(user_id);
  },
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: { key: null } })),
    post: vi.fn(async (url: string) => {
      if (url.endsWith("/challenge")) {
        h.on_challenge?.();

        return { data: { challenge: "challenge-1", expires_at: "" } };
      }

      return { data: {} };
    }),
    put: vi.fn(async () => {
      h.on_put?.();

      return h.put_results.shift() ?? { data: {} };
    }),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

import { api_client } from "@/services/api/client";
import {
  clear_external_pgp_key,
  get_external_decryption_keys,
  get_external_key_state,
  get_external_signing_key,
  prepare_external_key_import,
  replace_external_key,
  set_external_key_published,
  submit_external_key_revocation,
  upload_external_key,
} from "@/services/crypto/external_pgp_key";

let first_armored: string;
let second_armored: string;

async function make_armored(): Promise<string> {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ email: ADDRESS }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return privateKey;
}

function prepare(armored: string) {
  return prepare_external_key_import(armored, PASSPHRASE, ADDRESS);
}

function fingerprint_of(armored: string): Promise<string> {
  return openpgp
    .readPrivateKey({ armoredKey: armored })
    .then((key) => key.getFingerprint().toLowerCase());
}

beforeAll(async () => {
  first_armored = await make_armored();
  second_armored = await make_armored();
}, 60_000);

beforeEach(() => {
  clear_external_pgp_key();
  h.owner = "user-a";
  h.vault = { data_kek: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))) };
  h.cache.clear();
  h.put_results = [];
  h.on_challenge = null;
  h.on_put = null;
  vi.mocked(api_client.put).mockClear();
  vi.mocked(api_client.post).mockClear();
  vi.mocked(api_client.delete).mockClear();
});

describe("external key account switching", () => {
  it("does not adopt the key when the account changes before the upload", async () => {
    const prepared = await prepare(first_armored);

    h.on_challenge = () => {
      h.owner = "user-b";
    };

    const result = await upload_external_key(prepared);

    expect(result.ok).toBe(false);
    expect(api_client.put).not.toHaveBeenCalled();
    expect(get_external_signing_key()).toBeNull();
    expect(get_external_decryption_keys()).toEqual([]);
    expect(h.cache.has("user-b")).toBe(false);
  });

  it("does not adopt the key when the account changes during the upload", async () => {
    const prepared = await prepare(first_armored);

    h.on_put = () => {
      h.owner = "user-b";
    };

    const result = await upload_external_key(prepared);

    expect(result.ok).toBe(false);
    expect(get_external_key_state().status).toBe("none");
    expect(get_external_decryption_keys()).toEqual([]);
    expect(h.cache.has("user-b")).toBe(false);
  });

  it("keeps publish changes out of another account's state", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );

    vi.mocked(api_client.post).mockImplementationOnce(async () => {
      h.owner = "user-b";

      return { data: {} } as never;
    });

    await set_external_key_published(true);

    expect(h.cache.has("user-b")).toBe(false);
    expect(
      (h.cache.get("user-a") as { published: boolean }).published,
    ).toBe(true);
  });
});

describe("replacing an external key", () => {
  it("updates the same key in place and keeps it published", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );
    await set_external_key_published(true);

    const result = await replace_external_key(await prepare(first_armored));

    expect(result.ok).toBe(true);
    expect(api_client.delete).not.toHaveBeenCalled();
    expect(get_external_key_state().record?.published).toBe(true);
    expect(get_external_signing_key()).not.toBeNull();
  });

  it("restores the previous key when the new upload fails", async () => {
    const first_fingerprint = await fingerprint_of(first_armored);

    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );
    await set_external_key_published(true);
    vi.mocked(api_client.post).mockClear();

    h.put_results = [{ error: "failed", status: 500 }];

    const result = await replace_external_key(await prepare(second_armored));

    expect(result.ok).toBe(false);
    expect(api_client.delete).toHaveBeenCalledWith(
      expect.stringContaining("purge=true"),
    );
    expect(api_client.put).toHaveBeenCalledTimes(3);

    const restore_body = vi.mocked(api_client.put).mock.calls[2][1] as {
      public_key_armored: string;
    };
    const restored_public = await openpgp.readKey({
      armoredKey: restore_body.public_key_armored,
    });

    expect(restored_public.getFingerprint().toLowerCase()).toBe(
      first_fingerprint,
    );

    const state = get_external_key_state();

    expect(state.status).toBe("ready");
    expect(state.record?.fingerprint.toLowerCase()).toBe(first_fingerprint);
    expect(
      get_external_signing_key()?.getFingerprint().toLowerCase(),
    ).toBe(first_fingerprint);
    expect(api_client.post).toHaveBeenCalledWith(
      expect.stringContaining("/publish"),
      { publish: true },
    );
  });

  it("uploads the new key after removing a different one", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );

    const result = await replace_external_key(await prepare(second_armored));

    expect(result.ok).toBe(true);
    expect(api_client.delete).toHaveBeenCalledTimes(1);
    expect(get_external_key_state().record?.fingerprint.toLowerCase()).toBe(
      await fingerprint_of(second_armored),
    );
  });
});

describe("submitting a revocation for the stored key", () => {
  async function revoked_versions(armored: string) {
    const key = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: armored }),
      passphrase: PASSPHRASE,
    });
    const revoked = await openpgp.revokeKey({ key, format: "object" });
    const certificate = await openpgp.readKey({
      armoredKey: revoked.publicKey.armor(),
    });
    const packets = new openpgp.PacketList<openpgp.SignaturePacket>();

    packets.push(certificate.revocationSignatures[0]);
    const bare = `:${openpgp.armor(openpgp.enums.armor.publicKey, packets.write())}`;

    return { key_file: revoked.publicKey.armor(), certificate: bare };
  }

  function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  }

  async function sent_key(): Promise<openpgp.Key> {
    const body = vi.mocked(api_client.put).mock.calls.at(-1)?.[1] as {
      public_key_armored: string;
      wrapped_private_key: string;
      challenge_signature: string;
    };

    expect(body.wrapped_private_key).toBe("");
    expect(body.challenge_signature).toBe("");

    return openpgp.readKey({ armoredKey: body.public_key_armored });
  }

  it("sends the revoked public key and marks the key unpublished", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );
    await set_external_key_published(true);
    vi.mocked(api_client.put).mockClear();

    const { key_file } = await revoked_versions(first_armored);
    const result = await submit_external_key_revocation(encode(key_file));

    expect(result?.ok).toBe(true);
    const sent = await sent_key();

    expect(await sent.isRevoked()).toBe(true);
    expect(sent.getFingerprint().toLowerCase()).toBe(
      await fingerprint_of(first_armored),
    );
    expect(sent.isPrivate()).toBe(false);
    expect(get_external_key_state().record?.published).toBe(false);
  });

  it("applies a bare revocation certificate to the stored key", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );
    vi.mocked(api_client.put).mockClear();

    const { certificate } = await revoked_versions(first_armored);
    const result = await submit_external_key_revocation(encode(certificate));

    expect(result?.ok).toBe(true);
    expect(await (await sent_key()).isRevoked()).toBe(true);
  });

  it("ignores a revocation for a different key", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );
    vi.mocked(api_client.put).mockClear();

    const { key_file, certificate } = await revoked_versions(second_armored);

    expect(await submit_external_key_revocation(encode(key_file))).toBeNull();
    expect(await submit_external_key_revocation(encode(certificate))).toBeNull();
    expect(api_client.put).not.toHaveBeenCalled();
  });

  it("ignores a key that is not revoked", async () => {
    expect((await upload_external_key(await prepare(first_armored))).ok).toBe(
      true,
    );
    vi.mocked(api_client.put).mockClear();

    const public_only = (
      await openpgp.readPrivateKey({ armoredKey: first_armored })
    )
      .toPublic()
      .armor();

    expect(await submit_external_key_revocation(encode(public_only))).toBeNull();
    expect(api_client.put).not.toHaveBeenCalled();
  });
});
