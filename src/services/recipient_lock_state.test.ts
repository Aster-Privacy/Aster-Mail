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
  create_recipient_lock_scope,
  forget_field_lock_statuses,
  forget_recipient_lock_statuses,
  is_listed_pgp_recipient,
  record_field_lock_statuses,
  release_recipient_lock_scope,
  shows_encrypted_lock,
  type RecipientLockScope,
  type RecipientLockStatus,
} from "./recipient_lock_state";
import { decide_recipient_encryption } from "./client_pgp_copies";

function show(
  scope: RecipientLockScope,
  field: string,
  chips: [string, RecipientLockStatus, boolean?][],
): void {
  record_field_lock_statuses(
    scope,
    field,
    chips.map(([email, status, internal]) => [
      email,
      { status, internal: internal === true },
    ]),
  );
}

describe("recipient lock state", () => {
  let scope: RecipientLockScope;

  beforeEach(() => {
    forget_recipient_lock_statuses();
    scope = create_recipient_lock_scope();
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
    show(scope, "to", [
      ["Wkd@Example.org", "encrypted"],
      ["keyserver@example.net", "available"],
      ["plain@example.com", "transit"],
    ]);

    expect(
      collect_pgp_recipients(
        scope,
        ["wkd@example.org", "keyserver@example.net", "plain@example.com"],
        null,
      ),
    ).toEqual(["wkd@example.org"]);
    expect(
      collect_pgp_recipients(
        scope,
        ["WKD@example.org", "keyserver@example.net", "plain@example.com"],
        true,
      ),
    ).toEqual(["wkd@example.org", "keyserver@example.net"]);
  });

  it("lists nobody before a status is known or while it is checked", () => {
    expect(collect_pgp_recipients(scope, ["new@example.org"], true)).toEqual(
      [],
    );

    show(scope, "to", [["new@example.org", "checking"]]);

    expect(collect_pgp_recipients(scope, ["new@example.org"], true)).toEqual(
      [],
    );
  });

  it("lists nobody without a composer scope", () => {
    show(scope, "to", [["bob@example.com", "encrypted"]]);

    expect(
      collect_pgp_recipients(undefined, ["bob@example.com"], null),
    ).toEqual([]);
    expect(collect_pgp_recipients(null, ["bob@example.com"], null)).toEqual([]);
  });

  it("drops a recipient once its chip is removed", () => {
    show(scope, "to", [
      ["bob@example.com", "encrypted"],
      ["carol@example.com", "encrypted"],
    ]);
    show(scope, "to", [["carol@example.com", "encrypted"]]);

    expect(
      collect_pgp_recipients(
        scope,
        ["bob@example.com", "carol@example.com"],
        null,
      ),
    ).toEqual(["carol@example.com"]);
  });

  it("keeps two composers with the same recipient apart", () => {
    const other = create_recipient_lock_scope();

    show(scope, "to", [["bob@example.com", "encrypted"]]);
    show(other, "to", [["bob@example.com", "transit"]]);

    expect(collect_pgp_recipients(scope, ["bob@example.com"], null)).toEqual([
      "bob@example.com",
    ]);
    expect(collect_pgp_recipients(other, ["bob@example.com"], null)).toEqual(
      [],
    );

    show(other, "to", [["bob@example.com", "encrypted"]]);
    show(scope, "to", [["bob@example.com", "transit"]]);

    expect(collect_pgp_recipients(scope, ["bob@example.com"], null)).toEqual(
      [],
    );
  });

  it("forgets a field and a released composer", () => {
    show(scope, "to", [["bob@example.com", "encrypted"]]);
    show(scope, "cc", [["carol@example.com", "encrypted"]]);

    forget_field_lock_statuses(scope, "cc");

    expect(
      collect_pgp_recipients(
        scope,
        ["bob@example.com", "carol@example.com"],
        null,
      ),
    ).toEqual(["bob@example.com"]);

    release_recipient_lock_scope(scope);

    expect(collect_pgp_recipients(scope, ["bob@example.com"], null)).toEqual(
      [],
    );
  });

  it("forgets every composer on sign-out", () => {
    const other = create_recipient_lock_scope();

    show(scope, "to", [["bob@example.com", "encrypted"]]);
    show(other, "to", [["bob@example.com", "encrypted"]]);

    forget_recipient_lock_statuses();

    expect(collect_pgp_recipients(scope, ["bob@example.com"], null)).toEqual(
      [],
    );
    expect(collect_pgp_recipients(other, ["bob@example.com"], null)).toEqual(
      [],
    );
  });

  it("never lists an internal recipient shown with a lock", () => {
    show(scope, "to", [["team@custom-domain.example", "encrypted", true]]);
    show(scope, "cc", [["team@custom-domain.example", "encrypted"]]);

    expect(
      collect_pgp_recipients(scope, ["team@custom-domain.example"], true),
    ).toEqual([]);
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
