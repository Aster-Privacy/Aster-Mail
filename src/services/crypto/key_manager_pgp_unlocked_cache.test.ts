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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clear_unlocked_key_cache,
  unlock_private_key,
} from "./key_manager_pgp_unlocked_cache";

const PASS = "Unlock-Cache-Passw0rd";
const IDLE_LIMIT_MS = 15 * 60 * 1000;

async function make_secret_key(): Promise<string> {
  const { privateKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "cache", email: "cache@example.com" }],
    passphrase: PASS,
    format: "armored",
  });

  return privateKey;
}

afterEach(() => {
  vi.useRealTimers();
  clear_unlocked_key_cache();
});

describe("unlocked private key cache", () => {
  it("reuses an unlocked key while it stays in use", async () => {
    const secret = await make_secret_key();
    const first = await unlock_private_key(secret, PASS);

    expect(await unlock_private_key(secret, PASS)).toBe(first);
  });

  it("drops an unlocked key after it sits idle", async () => {
    const secret = await make_secret_key();

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));

    const first = await unlock_private_key(secret, PASS);

    vi.setSystemTime(new Date(Date.now() + IDLE_LIMIT_MS + 1000));

    expect(await unlock_private_key(secret, PASS)).not.toBe(first);
  });
});

describe("concurrent unlocks", () => {
  it("shares one in-flight unlock between callers", async () => {
    const secret = await make_secret_key();
    const first = unlock_private_key(secret, PASS);
    const second = unlock_private_key(secret, PASS);

    expect(second).toBe(first);
    expect(await second).toBe(await first);
  });
});
