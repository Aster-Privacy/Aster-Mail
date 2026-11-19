import { beforeEach, describe, expect, it, vi } from "vitest";

const fetch_recovery_escrow_keys = vi.fn();
const seal_account_key_token = vi.fn();
const read_private_key = vi.fn();
const sealed_account_keys: number[][] = [];
const TOKEN =
  "-----BEGIN PGP MESSAGE-----\nx\n-----END PGP MESSAGE-----";

vi.mock("../api/recovery", () => ({
  fetch_recovery_escrow_keys: (token: string) =>
    fetch_recovery_escrow_keys(token),
}));

vi.mock("./account_key_token", () => ({
  seal_account_key_token: (...args: unknown[]) =>
    seal_account_key_token(...args),
}));

vi.mock("openpgp", async (import_original) => ({
  ...((await import_original()) as object),
  readPrivateKey: (...args: unknown[]) => read_private_key(...args),
}));

import { rescue_account_key_from_escrow } from "./recovery_escrow_rescue";
import { seal_legacy_escrow_entry } from "./recovery_escrow_fixtures";
import {
  ESCROW_FORMAT,
  derive_escrow_keys,
  derive_legacy_escrow_keypair,
  encode_escrow_seed,
  generate_escrow_seed,
  seal_account_key_to_escrow,
} from "./recovery_key_escrow";
import { array_to_base64 } from "./base64";

const USER_ID = "1dd0b0f4-9b0d-4f0e-9e6a-1f3b4c5d6e7f";
const FINGERPRINT = "a".repeat(40);

function make_account_key(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function current_source(seed: Uint8Array) {
  return {
    escrow_seed: encode_escrow_seed(seed),
    escrow_format: ESCROW_FORMAT,
  };
}

function legacy_source(seed: Uint8Array) {
  return { escrow_seed: encode_escrow_seed(seed) };
}

async function make_escrow(seed: Uint8Array, versions: number[]) {
  const keys = derive_escrow_keys(seed, USER_ID);
  const entries = [];

  for (const token_version of versions) {
    entries.push({
      token_version,
      sealed: await seal_account_key_to_escrow(
        make_account_key(token_version),
        keys,
        USER_ID,
        token_version,
      ),
    });
  }

  return {
    user_id: USER_ID,
    escrow_public_key: array_to_base64(keys.public_key),
    entries,
  };
}

async function make_legacy_escrow(seed: Uint8Array, versions: number[]) {
  const keypair = derive_legacy_escrow_keypair(seed, USER_ID);
  const entries = [];

  for (const token_version of versions) {
    entries.push({
      token_version,
      sealed: await seal_legacy_escrow_entry(
        make_account_key(token_version),
        keypair.public_key,
        USER_ID,
        token_version,
      ),
    });
  }

  return {
    user_id: USER_ID,
    escrow_public_key: array_to_base64(keypair.public_key),
    entries,
  };
}

describe("rescue_account_key_from_escrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sealed_account_keys.length = 0;
    seal_account_key_token.mockImplementation((account_key: Uint8Array) => {
      sealed_account_keys.push(Array.from(account_key));

      return Promise.resolve(TOKEN);
    });
    read_private_key.mockResolvedValue({
      getFingerprint: () => FINGERPRINT.toUpperCase(),
    });
  });

  it("returns null without an escrow seed", async () => {
    const result = await rescue_account_key_from_escrow(
      "token",
      {},
      "identity",
      "password",
    );

    expect(result).toBeNull();
    expect(fetch_recovery_escrow_keys).not.toHaveBeenCalled();
  });

  it("returns null when the server has no escrow entries", async () => {
    fetch_recovery_escrow_keys.mockResolvedValue({
      data: { user_id: USER_ID, escrow_public_key: null, entries: [] },
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(generate_escrow_seed()),
      "identity",
      "password",
    );

    expect(result).toBeNull();
  });

  it("re-seals the highest token version to the new identity key", async () => {
    const seed = generate_escrow_seed();

    fetch_recovery_escrow_keys.mockResolvedValue({
      data: await make_escrow(seed, [1, 2, 3]),
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).toEqual({ token: TOKEN, fingerprint: FINGERPRINT });

    const [, identity_key, password, serial] =
      seal_account_key_token.mock.calls[0];

    expect(sealed_account_keys[0]).toEqual(Array.from(make_account_key(3)));
    expect(identity_key).toBe("new-identity");
    expect(password).toBe("new-password");
    expect(serial).toBe(4);
  });

  it("skips entries the server sealed to the published key", async () => {
    const seed = generate_escrow_seed();
    const escrow = await make_escrow(seed, [1]);
    const published = derive_escrow_keys(seed, USER_ID).public_key;
    const server_key = new Uint8Array(32).fill(0xee);

    escrow.entries.push({
      token_version: 9,
      sealed: await seal_account_key_to_escrow(
        server_key,
        {
          public_key: published,
          auth_key: crypto.getRandomValues(new Uint8Array(32)),
        },
        USER_ID,
        9,
      ),
    });
    escrow.entries.push({
      token_version: 8,
      sealed: await seal_legacy_escrow_entry(
        server_key,
        published,
        USER_ID,
        8,
      ),
    });
    fetch_recovery_escrow_keys.mockResolvedValue({ data: escrow });

    const result = await rescue_account_key_from_escrow(
      "token",
      legacy_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).not.toBeNull();
    expect(sealed_account_keys).toEqual([Array.from(make_account_key(1))]);
    expect(seal_account_key_token.mock.calls[0][3]).toBe(2);
  });

  it("signs in nothing when every entry came from the server", async () => {
    const seed = generate_escrow_seed();
    const published = derive_escrow_keys(seed, USER_ID).public_key;

    fetch_recovery_escrow_keys.mockResolvedValue({
      data: {
        user_id: USER_ID,
        escrow_public_key: array_to_base64(published),
        entries: [
          {
            token_version: 4,
            sealed: await seal_legacy_escrow_entry(
              new Uint8Array(32).fill(0xee),
              published,
              USER_ID,
              4,
            ),
          },
        ],
      },
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).toBeNull();
    expect(seal_account_key_token).not.toHaveBeenCalled();
  });

  it("refuses the legacy format once the account has moved on", async () => {
    const seed = generate_escrow_seed();

    fetch_recovery_escrow_keys.mockResolvedValue({
      data: await make_legacy_escrow(seed, [1, 2]),
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).toBeNull();
    expect(seal_account_key_token).not.toHaveBeenCalled();
  });

  it("opens legacy entries for an account that has not moved on", async () => {
    const seed = generate_escrow_seed();

    fetch_recovery_escrow_keys.mockResolvedValue({
      data: await make_legacy_escrow(seed, [1, 2]),
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      legacy_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).toEqual({ token: TOKEN, fingerprint: FINGERPRINT });
    expect(sealed_account_keys[0]).toEqual(Array.from(make_account_key(2)));
    expect(seal_account_key_token.mock.calls[0][3]).toBe(3);
  });

  it("opens current entries for an account that is not marked yet", async () => {
    const seed = generate_escrow_seed();

    fetch_recovery_escrow_keys.mockResolvedValue({
      data: await make_escrow(seed, [5]),
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      legacy_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).not.toBeNull();
    expect(sealed_account_keys[0]).toEqual(Array.from(make_account_key(5)));
  });

  it("skips entries with an invalid token version", async () => {
    const seed = generate_escrow_seed();
    const escrow = await make_escrow(seed, [2]);

    escrow.entries.push({
      token_version: -1,
      sealed: escrow.entries[0].sealed,
    });
    fetch_recovery_escrow_keys.mockResolvedValue({ data: escrow });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).not.toBeNull();
    expect(seal_account_key_token).toHaveBeenCalledTimes(1);
    expect(seal_account_key_token.mock.calls[0][3]).toBe(3);
  });

  it("returns null when the seed does not match the published public key", async () => {
    fetch_recovery_escrow_keys.mockResolvedValue({
      data: await make_escrow(generate_escrow_seed(), [1]),
    });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(generate_escrow_seed()),
      "new-identity",
      "new-password",
    );

    expect(result).toBeNull();
    expect(seal_account_key_token).not.toHaveBeenCalled();
  });

  it("returns null when every entry fails to open", async () => {
    const seed = generate_escrow_seed();
    const escrow = await make_escrow(seed, [1]);

    escrow.entries[0].sealed = array_to_base64(new Uint8Array(92).fill(7));
    fetch_recovery_escrow_keys.mockResolvedValue({ data: escrow });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).toBeNull();
    expect(seal_account_key_token).not.toHaveBeenCalled();
  });

  it("returns null when the fetch fails", async () => {
    fetch_recovery_escrow_keys.mockResolvedValue({ error: "unauthorized" });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(generate_escrow_seed()),
      "new-identity",
      "new-password",
    );

    expect(result).toBeNull();
  });

  it("falls back to an older entry when the newest is tampered with", async () => {
    const seed = generate_escrow_seed();
    const escrow = await make_escrow(seed, [1, 2]);
    const newest = escrow.entries.find((e) => e.token_version === 2);

    if (newest) newest.sealed = array_to_base64(new Uint8Array(92).fill(7));
    fetch_recovery_escrow_keys.mockResolvedValue({ data: escrow });

    const result = await rescue_account_key_from_escrow(
      "token",
      current_source(seed),
      "new-identity",
      "new-password",
    );

    expect(result).not.toBeNull();

    const [, , , serial] = seal_account_key_token.mock.calls[0];

    expect(sealed_account_keys[0]).toEqual(Array.from(make_account_key(1)));
    expect(serial).toBe(2);
  });
});
