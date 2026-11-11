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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  unreadable: new Set<string>(),
  fail_reads: false,
  fail_listing: false,
  classification_down: false,
  current_identity: null as string | null,
  history: null as {
    identity_keys: string[];
    history_complete: boolean;
  } | null,
  history_calls: 0,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

vi.mock("@/services/recipient_classification", () => ({
  get_cached_recipient_classification: () => null,
  classify_recipients: async (emails: string[]) => {
    if (h.classification_down) throw new Error("lookup unavailable");

    return new Map(
      emails.map((email) => [
        email,
        email.endsWith("@custom.example") ? "internal" : "external",
      ]),
    );
  },
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(3),
  on_vault_cleared: () => () => {},
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => undefined,
}));

vi.mock("@/services/crypto/encrypted_storage", async () => {
  const support = (
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store);

  return {
    ...support,
    encrypted_list_keys: async () => {
      if (h.fail_listing) throw new Error("store unavailable");

      return support.encrypted_list_keys();
    },
    encrypted_get: vi.fn(async (key: string) => {
      if (h.fail_reads) throw new Error("store unavailable");

      return h.store.has(key) && !h.unreadable.has(key)
        ? JSON.parse(JSON.stringify(h.store.get(key)))
        : null;
    }),
    encrypted_set: vi.fn(async (key: string, value: unknown) => {
      h.unreadable.delete(key);
      h.store.set(key, JSON.parse(JSON.stringify(value)));
    }),
    encrypted_delete: vi.fn(async (key: string) => {
      h.unreadable.delete(key);
      h.store.delete(key);
    }),
  };
});

vi.mock("@/services/api/keys", () => ({
  extract_username_from_email: (email: string) => email.split("@")[0],
  is_internal_email: (email: string) =>
    email.toLowerCase().endsWith("@astermail.org"),
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_ratchet_identity: vi.fn(async () =>
    h.current_identity ? { kem_identity_key: h.current_identity } : null,
  ),
  fetch_prekey_bundle: vi.fn(async () => null),
  fetch_published_identity_history: vi.fn(async () => {
    h.history_calls += 1;

    return h.history;
  }),
}));

import {
  authenticate_sender_identity,
  check_sender_identity_continuity,
  clear_sender_identity_authentication_cache,
  peek_sender_identity_status,
} from "@/services/crypto/sender_identity_authentication";
import {
  base64_to_array,
  compute_hash,
} from "@/services/crypto/key_manager_core";
import { reset_contact_entry_state } from "@/services/crypto/contact_entries";
import {
  check_and_pin_identity,
  trust_recipient_keys,
} from "@/services/crypto/ratchet_identity_pin";
import {
  IDENTITY_PIN_PREFIX,
  SENDER_HISTORY_PREFIX,
  canonical_storage_name,
  forget_stored_names,
  reset_storage_name_state,
  scoped_storage_name,
} from "@/services/crypto/storage_key_names";

const CURRENT_KEY = btoa("current-identity-key-aaaaaaaaaaaa");
const ROTATED_KEY = btoa("rotated-identity-key-bbbbbbbbbbb");
const OTHER_KEY = btoa("other-identity-key-cccccccccccc");
const SENDER = "someone@astermail.org";

function place(name: string, value: unknown): string {
  h.store.set(name, value);
  forget_stored_names();

  return name;
}

async function seed_history(id: string, keys: string[]): Promise<string> {
  return place(
    await canonical_storage_name(SENDER_HISTORY_PREFIX, "acct-1", id),
    keys,
  );
}

async function seed_earlier_history(
  spelling: string,
  keys: string[],
): Promise<string> {
  return place(
    await scoped_storage_name(SENDER_HISTORY_PREFIX, "acct-1", spelling),
    keys,
  );
}

async function seed_pin(id: string, key: string): Promise<string> {
  return place(
    await canonical_storage_name(IDENTITY_PIN_PREFIX, "acct-1", id),
    {
      fingerprint: await compute_hash(base64_to_array(key)),
      verified: false,
      pinned_at: 1,
    },
  );
}

function history_entries(): unknown[] {
  return [...h.store.entries()]
    .filter(([name]) => name.startsWith(SENDER_HISTORY_PREFIX))
    .map(([, value]) => value);
}

function reset_all(): void {
  h.store.clear();
  h.unreadable.clear();
  h.fail_reads = false;
  h.fail_listing = false;
  h.classification_down = false;
  h.current_identity = null;
  h.history = null;
  h.history_calls = 0;
  reset_storage_name_state();
  reset_contact_entry_state();
  clear_sender_identity_authentication_cache();
}

describe("sender identity authentication", () => {
  beforeEach(() => {
    reset_all();
    h.current_identity = CURRENT_KEY;
  });

  it("does not treat a pin moved by a later send as a known key", async () => {
    await check_and_pin_identity(SENDER, CURRENT_KEY);

    expect(await check_and_pin_identity(SENDER, OTHER_KEY, true)).toBe(
      "rotated",
    );

    h.current_identity = OTHER_KEY;

    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "changed",
    );
    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "changed",
    );
  });

  it("verifies the currently published identity key", async () => {
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );
  });

  it("verifies a key that appears in the published history", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    expect(await authenticate_sender_identity(SENDER, ROTATED_KEY)).toBe(
      "verified",
    );
  });

  it("reports a mismatch for a never published key when history is complete", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "mismatch",
    );
  });

  it("reports unverified for a never published key when the history is incomplete", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY],
      history_complete: false,
    };

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
  });

  it("does not remember an unmatched key, so a repeat delivery stays unverified", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY],
      history_complete: true,
    };

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "mismatch",
    );
    expect(history_entries()).toEqual([]);

    h.current_identity = null;
    h.history = null;
    clear_sender_identity_authentication_cache();

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "unverified",
    );
  });

  it("remembers only the matched key, leaving a later key unverified without server evidence", async () => {
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );

    h.current_identity = null;
    h.history = null;
    clear_sender_identity_authentication_cache();

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );
  });

  it("reports unverified when the history cannot be fetched", async () => {
    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
  });

  it("caches the published history between lookups", async () => {
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    await authenticate_sender_identity(SENDER, OTHER_KEY);
    await authenticate_sender_identity(SENDER, OTHER_KEY);

    expect(h.history_calls).toBe(2);
  });

  it("verifies a remembered key after the account rotates away from it when nothing is pinned", async () => {
    h.history = {
      identity_keys: [ROTATED_KEY],
      history_complete: true,
    };

    expect(await authenticate_sender_identity(SENDER, ROTATED_KEY)).toBe(
      "verified",
    );

    h.current_identity = CURRENT_KEY;
    h.history = { identity_keys: [CURRENT_KEY], history_complete: true };
    clear_sender_identity_authentication_cache();

    expect(await authenticate_sender_identity(SENDER, ROTATED_KEY)).toBe(
      "verified",
    );
  });

  it("never returns verified for a key that differs from the pin, even when the directory confirms it", async () => {
    await seed_pin(SENDER, CURRENT_KEY);
    h.current_identity = OTHER_KEY;
    h.history = {
      identity_keys: [CURRENT_KEY, OTHER_KEY],
      history_complete: true,
    };

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(peek_sender_identity_status(SENDER)).toBe("unverified");
    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(history_entries()).toEqual([]);
    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "changed",
    );
  });

  it("never returns verified for a key that differs from the remembered ones, even when the directory confirms it", async () => {
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );

    h.current_identity = OTHER_KEY;
    clear_sender_identity_authentication_cache();

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(peek_sender_identity_status(SENDER)).toBe("unverified");
    expect(history_entries()).toEqual([[CURRENT_KEY]]);
  });

  it("verifies the new key once the user trusts it", async () => {
    await seed_pin(SENDER, CURRENT_KEY);
    h.current_identity = OTHER_KEY;

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );

    await trust_recipient_keys(SENDER, OTHER_KEY, null);
    clear_sender_identity_authentication_cache();

    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "verified",
    );
  });

  it("does not let an older remembered key verify a message once another key is pinned", async () => {
    await seed_history(SENDER, [ROTATED_KEY]);
    await seed_pin(SENDER, CURRENT_KEY);
    h.current_identity = CURRENT_KEY;
    h.history = {
      identity_keys: [CURRENT_KEY, ROTATED_KEY],
      history_complete: true,
    };

    expect(await check_sender_identity_continuity(SENDER, ROTATED_KEY)).toBe(
      "superseded",
    );
    expect(await authenticate_sender_identity(SENDER, ROTATED_KEY)).toBe(
      "unverified",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );
  });
});

describe("sender identity continuity", () => {
  beforeEach(reset_all);

  it("treats a first contact as new and verifies it when the directory confirms the key", async () => {
    h.current_identity = OTHER_KEY;

    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "new",
    );
    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "verified",
    );
  });

  it("treats a key seen in an earlier message as known", async () => {
    h.current_identity = CURRENT_KEY;
    await authenticate_sender_identity(SENDER, CURRENT_KEY);

    expect(
      await check_sender_identity_continuity(
        "Someone@astermail.org",
        CURRENT_KEY,
      ),
    ).toBe("known");
  });

  it("reports a change when a remembered sender presents a different key", async () => {
    h.current_identity = CURRENT_KEY;
    await authenticate_sender_identity(SENDER, CURRENT_KEY);

    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "changed",
    );
  });

  it("uses the recipient pin from an earlier send", async () => {
    await seed_pin(SENDER, CURRENT_KEY);

    expect(await check_sender_identity_continuity(SENDER, CURRENT_KEY)).toBe(
      "known",
    );
    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "changed",
    );
  });

  it("never treats a missing key as a first contact", async () => {
    expect(await check_sender_identity_continuity(SENDER, "")).toBe(
      "unreadable",
    );
  });

  it("finds history saved under a dotted spelling from the plain address", async () => {
    await seed_earlier_history("a.b@astermail.org", [CURRENT_KEY]);

    expect(
      await check_sender_identity_continuity("ab@astermail.org", CURRENT_KEY),
    ).toBe("known");
    expect(
      await check_sender_identity_continuity(
        "A.B+news@astermail.org",
        OTHER_KEY,
      ),
    ).toBe("changed");
  });

  it("never reads history it cannot attribute from the plain address as empty", async () => {
    h.current_identity = OTHER_KEY;

    const tagged_name = await seed_earlier_history("a.b+news@astermail.org", [
      CURRENT_KEY,
    ]);

    expect(
      await check_sender_identity_continuity("ab@astermail.org", OTHER_KEY),
    ).toBe("unreadable");
    expect(
      await authenticate_sender_identity("ab@astermail.org", OTHER_KEY),
    ).toBe("unverified");
    expect(h.store.get(tagged_name)).toEqual([CURRENT_KEY]);
    expect(history_entries()).toEqual([[CURRENT_KEY]]);
    expect(
      await check_sender_identity_continuity(
        "a.b+news@astermail.org",
        OTHER_KEY,
      ),
    ).toBe("changed");
    expect(
      await check_sender_identity_continuity("ab@astermail.org", CURRENT_KEY),
    ).toBe("known");
  });

  it("remembers one history for every spelling of the mailbox", async () => {
    h.current_identity = CURRENT_KEY;
    await authenticate_sender_identity("a.b@astermail.org", CURRENT_KEY);
    clear_sender_identity_authentication_cache();

    expect(
      await check_sender_identity_continuity(
        "ab+news@astermail.org",
        CURRENT_KEY,
      ),
    ).toBe("known");
    expect(
      await check_sender_identity_continuity("ab@astermail.org", OTHER_KEY),
    ).toBe("changed");
  });

  it("keeps each spelling of an outside address apart", async () => {
    await seed_earlier_history("a.b@example.com", [CURRENT_KEY]);

    expect(
      await check_sender_identity_continuity("a.b@example.com", OTHER_KEY),
    ).toBe("changed");
    expect(
      await check_sender_identity_continuity("ab@example.com", OTHER_KEY),
    ).toBe("new");
  });

  it("does not treat an unreadable pin as a first contact", async () => {
    h.current_identity = CURRENT_KEY;

    const name = await seed_pin(SENDER, CURRENT_KEY);

    h.unreadable.add(name);

    expect(await check_sender_identity_continuity(SENDER, CURRENT_KEY)).toBe(
      "unreadable",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "unverified",
    );
    expect(history_entries()).toEqual([]);
  });

  it("does not let a remembered key stand in for a pin it cannot read", async () => {
    await seed_history(SENDER, [CURRENT_KEY]);
    h.unreadable.add(await seed_pin(SENDER, OTHER_KEY));
    h.current_identity = CURRENT_KEY;

    expect(await check_sender_identity_continuity(SENDER, CURRENT_KEY)).toBe(
      "unreadable",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "unverified",
    );
  });

  it("does not treat unreadable history as an empty one", async () => {
    h.current_identity = OTHER_KEY;

    const name = await seed_history(SENDER, [CURRENT_KEY]);

    h.unreadable.add(name);

    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "unreadable",
    );
    expect(await authenticate_sender_identity(SENDER, OTHER_KEY)).toBe(
      "unverified",
    );
    expect(h.store.get(name)).toEqual([CURRENT_KEY]);

    h.unreadable.delete(name);
    clear_sender_identity_authentication_cache();

    expect(await check_sender_identity_continuity(SENDER, OTHER_KEY)).toBe(
      "changed",
    );
  });

  it("counts a failing store read as unreadable and remembers nothing", async () => {
    h.current_identity = CURRENT_KEY;
    h.fail_reads = true;

    expect(await check_sender_identity_continuity(SENDER, CURRENT_KEY)).toBe(
      "unreadable",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "unverified",
    );
    expect(history_entries()).toEqual([]);

    h.fail_reads = false;
    reset_storage_name_state();
    reset_contact_entry_state();
    clear_sender_identity_authentication_cache();

    expect(await check_sender_identity_continuity(SENDER, CURRENT_KEY)).toBe(
      "new",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );
  });

  it("counts a failing store listing as unreadable and remembers nothing", async () => {
    h.current_identity = CURRENT_KEY;
    h.fail_listing = true;

    expect(await check_sender_identity_continuity(SENDER, CURRENT_KEY)).toBe(
      "unreadable",
    );
    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "unverified",
    );
    expect(history_entries()).toEqual([]);

    h.fail_listing = false;
    clear_sender_identity_authentication_cache();

    expect(await authenticate_sender_identity(SENDER, CURRENT_KEY)).toBe(
      "verified",
    );
  });

  it("remembers nothing for a sender whose domain is not classified yet", async () => {
    h.current_identity = CURRENT_KEY;
    h.classification_down = true;

    expect(
      await check_sender_identity_continuity(
        "j.doe@custom.example",
        CURRENT_KEY,
      ),
    ).toBe("unreadable");
    expect(
      await authenticate_sender_identity("j.doe@custom.example", CURRENT_KEY),
    ).toBe("unverified");
    expect(h.store.size).toBe(0);

    h.classification_down = false;
    clear_sender_identity_authentication_cache();

    expect(
      await authenticate_sender_identity("j.doe@custom.example", CURRENT_KEY),
    ).toBe("verified");
    expect(
      await check_sender_identity_continuity(
        "j.doe+shop@custom.example",
        CURRENT_KEY,
      ),
    ).toBe("known");
    expect(
      await check_sender_identity_continuity(
        "jdoe@custom.example",
        CURRENT_KEY,
      ),
    ).toBe("new");
  });
});
