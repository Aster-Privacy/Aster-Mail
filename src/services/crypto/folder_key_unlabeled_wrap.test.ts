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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FOLDER_KEY_VERSION,
  FOLDER_KEY_VERSION_LEGACY,
  base64_to_array,
  derive_password_keys,
  encrypt_folder_key,
  folder_pin_level_after_unlock,
  generate_folder_key,
  open_folder_wrap_for_unlock,
  prepare_set_password,
} from "./folder_protection";

const FOLDER_A = "0B1C2D3E-4F50-4612-8734-56789ABCDEF0";
const FOLDER_B = "11111111-2222-4333-8444-555555555555";
const PASSWORD = "hunter2";

async function bound_wrap(folder_id: string) {
  const { data, folder_key } = await prepare_set_password(
    PASSWORD,
    folder_id,
    true,
  );
  const salt = base64_to_array(data.password_salt);
  const { encryption_key } = await derive_password_keys(PASSWORD, salt);

  return {
    folder_key,
    salt,
    encryption_key,
    encrypted: base64_to_array(data.encrypted_folder_key),
    nonce: base64_to_array(data.folder_key_nonce),
    version: data.folder_key_version,
  };
}

async function unbound_wrap() {
  const folder_key = generate_folder_key();
  const salt = new Uint8Array(32).fill(7);
  const { encryption_key } = await derive_password_keys(PASSWORD, salt);
  const { encrypted, nonce } = await encrypt_folder_key(
    folder_key,
    encryption_key,
  );

  return { folder_key, salt, encryption_key, encrypted, nonce };
}

async function open_without_version(
  folder_id: string,
  pin_level: number,
  wrap: {
    salt: Uint8Array;
    encrypted: Uint8Array;
    nonce: Uint8Array;
    encryption_key: Uint8Array;
  },
  server_version: unknown = undefined,
) {
  return open_folder_wrap_for_unlock(
    folder_id,
    pin_level,
    server_version,
    wrap.salt,
    wrap.encrypted,
    wrap.nonce,
    wrap.encryption_key,
  ).catch(() => null);
}

describe("bound folder wrap returned without its version", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces a bound decrypt failure that is not a wrong key", async () => {
    const wrap = await bound_wrap(FOLDER_A);
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);

    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(
      async (algorithm, key, data) => {
        if ((algorithm as AesGcmParams).additionalData) {
          throw new TypeError("bound decrypt unavailable");
        }

        return decrypt(algorithm, key, data);
      },
    );

    await expect(
      open_folder_wrap_for_unlock(
        FOLDER_A,
        FOLDER_KEY_VERSION,
        undefined,
        wrap.salt,
        wrap.encrypted,
        wrap.nonce,
        wrap.encryption_key,
      ),
    ).rejects.toThrow("bound decrypt unavailable");
  });

  it("opens a bound wrap when the server drops the version", async () => {
    const wrap = await bound_wrap(FOLDER_A);

    expect(wrap.version).toBe(FOLDER_KEY_VERSION);

    const opening = await open_without_version(FOLDER_A, 0, wrap);

    expect(opening?.folder_key).toEqual(wrap.folder_key);
    expect(opening?.format.bound).toBe(true);
    expect(opening?.rebind).toBe(false);
    expect(folder_pin_level_after_unlock(opening!.format, wrap.salt)).toBe(
      FOLDER_KEY_VERSION,
    );
  });

  it("opens a bound wrap when the server sends a null version", async () => {
    const wrap = await bound_wrap(FOLDER_A);
    const opening = await open_without_version(FOLDER_A, 1, wrap, null);

    expect(opening?.folder_key).toEqual(wrap.folder_key);
    expect(opening?.format.bound).toBe(true);
  });

  it("opens a bound wrap without a rewrite once the folder is pinned", async () => {
    const wrap = await bound_wrap(FOLDER_A);
    const opening = await open_without_version(
      FOLDER_A,
      FOLDER_KEY_VERSION,
      wrap,
    );

    expect(opening?.folder_key).toEqual(wrap.folder_key);
    expect(opening?.rebind).toBe(false);
  });

  it("refuses a bound wrap moved from another folder", async () => {
    const wrap = await bound_wrap(FOLDER_B);

    expect(await open_without_version(FOLDER_A, 0, wrap)).toBeNull();
    expect(
      await open_without_version(FOLDER_A, FOLDER_KEY_VERSION, wrap),
    ).toBeNull();
  });

  it("only tries the bound format when the version is missing", async () => {
    const wrap = await bound_wrap(FOLDER_A);

    expect(
      await open_without_version(FOLDER_A, 0, wrap, FOLDER_KEY_VERSION_LEGACY),
    ).toBeNull();
  });

  it("still opens an unbound wrap as the older format", async () => {
    const wrap = await unbound_wrap();
    const opening = await open_without_version(FOLDER_A, 0, wrap);

    expect(opening?.folder_key).toEqual(wrap.folder_key);
    expect(opening?.format.bound).toBe(false);
    expect(opening?.rebind).toBe(false);
  });

  it("keeps the rewrite rule for an unbound wrap on a pinned folder", async () => {
    const wrap = await unbound_wrap();
    const opening = await open_without_version(
      FOLDER_A,
      FOLDER_KEY_VERSION,
      wrap,
    );

    expect(opening?.folder_key).toEqual(wrap.folder_key);
    expect(opening?.rebind).toBe(true);
  });
});
