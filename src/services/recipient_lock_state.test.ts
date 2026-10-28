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
import { beforeEach, describe, expect, it } from "vitest";

import {
  collect_pgp_recipients,
  forget_recipient_lock_statuses,
  is_listed_pgp_recipient,
  record_recipient_lock_status,
  shows_encrypted_lock,
} from "./recipient_lock_state";
import { decide_recipient_encryption } from "./client_pgp_copies";

describe("recipient lock state", () => {
  beforeEach(() => {
    forget_recipient_lock_statuses();
  });

  it("shows a lock for a found key only when the sender turns encryption on", () => {
    expect(shows_encrypted_lock("available", null)).toBe(false);
    expect(shows_encrypted_lock("available", true)).toBe(true);
    expect(shows_encrypted_lock("encrypted", null)).toBe(true);
    expect(shows_encrypted_lock("encrypted", false)).toBe(false);
    expect(shows_encrypted_lock("transit", true)).toBe(false);
    expect(shows_encrypted_lock("checking", true)).toBe(false);
    expect(shows_encrypted_lock(undefined, true)).toBe(false);
  });

  it("lists every outside recipient whose chip showed a lock", () => {
    record_recipient_lock_status("Wkd@Example.org", "encrypted");
    record_recipient_lock_status("keyserver@example.net", "available");
    record_recipient_lock_status("plain@example.com", "transit");

    expect(
      collect_pgp_recipients(
        ["wkd@example.org", "keyserver@example.net", "plain@example.com"],
        null,
      ),
    ).toEqual(["wkd@example.org"]);
    expect(
      collect_pgp_recipients(
        ["WKD@example.org", "keyserver@example.net", "plain@example.com"],
        true,
      ),
    ).toEqual(["wkd@example.org", "keyserver@example.net"]);
  });

  it("lists nobody before a status is known", () => {
    expect(collect_pgp_recipients(["new@example.org"], true)).toEqual([]);
  });

  it("matches listed recipients without regard to case or spacing", () => {
    expect(is_listed_pgp_recipient([" a@example.org "], "A@Example.org")).toBe(
      true,
    );
    expect(is_listed_pgp_recipient([], "a@example.org")).toBe(false);
    expect(is_listed_pgp_recipient(undefined, "a@example.org")).toBe(false);
  });

  it("encrypts a listed recipient even when the key is not trusted for automatic use", () => {
    const keyserver_key = {
      email: "keyserver@example.net",
      found: true,
      public_key: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      will_encrypt: false,
    } as Parameters<typeof decide_recipient_encryption>[0];

    expect(decide_recipient_encryption(keyserver_key, {})).toBe("plain");
    expect(decide_recipient_encryption(keyserver_key, {}, true)).toBe(
      "encrypt",
    );
    expect(decide_recipient_encryption(undefined, {}, true)).toBe("server");
  });
});
