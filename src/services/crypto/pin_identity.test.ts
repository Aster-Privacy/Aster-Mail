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
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  unreadable: new Set<string>(),
  hosted_domains: new Set<string>(),
  classification_down: false,
  list_calls: 0,
  read_calls: 0,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  on_vault_cleared: () => () => {},
}));

vi.mock("@/services/crypto/encrypted_storage", async () => {
  const support = (
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store);

  return {
    ...support,
    encrypted_list_keys: async () => {
      h.list_calls += 1;

      return support.encrypted_list_keys();
    },
    encrypted_has: async (key: string) => {
      h.read_calls += 1;

      return support.encrypted_has(key);
    },
    encrypted_get: vi.fn(async (key: string) => {
      h.read_calls += 1;

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

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: (email: string) =>
    ["astermail.org", "aster.cx"].includes(email.split("@")[1] ?? ""),
}));

vi.mock("@/services/recipient_classification", () => ({
  get_cached_recipient_classification: () => null,
  classify_recipients: async (emails: string[]) => {
    if (h.classification_down) throw new Error("lookup unavailable");

    return new Map(
      emails.map((email) => [
        email,
        h.hosted_domains.has(email.split("@")[1] ?? "")
          ? "internal"
          : "external",
      ]),
    );
  },
}));

import {
  base64_to_array,
  compute_hash,
} from "@/services/crypto/key_manager_core";
import {
  canonical_pin_id,
  describe_pin_contact,
  dotted_spellings,
  resolve_pin_contact,
} from "@/services/crypto/pin_identity";
import {
  reset_contact_entry_state,
  with_contact_lock,
} from "@/services/crypto/contact_entries";
import {
  check_and_pin_identity,
  check_owner_key_pin,
  flag_recipient_untrusted,
  get_recipient_pin_health,
  is_recipient_flagged_untrusted,
  lookup_identity_pin_record,
  lookup_owner_key_pin,
  lookup_pinned_identity,
  open_pin_contact,
  owner_key_fingerprint,
  read_sender_history,
  replace_owner_key_pin,
  trust_recipient_keys,
} from "@/services/crypto/ratchet_identity_pin";
import {
  KeyPinUnavailableError,
  RecipientPinUnreadableError,
} from "@/services/crypto/ratchet_types";
import {
  clear_ratchet_verification_status,
  dismiss_peer_identity_event,
  get_peer_identity_event,
  record_peer_identity_event,
} from "@/services/crypto/ratchet_verification_status";
import {
  IDENTITY_PIN_PREFIX,
  IDENTITY_UNTRUSTED_PREFIX,
  OWNER_KEY_PIN_PREFIX,
  SENDER_HISTORY_PREFIX,
  canonical_storage_name,
  forget_stored_names,
  reset_storage_name_state,
  scoped_storage_name,
} from "@/services/crypto/storage_key_names";

const KEY_A = btoa("identity-key-aaaaaaaaaaaaaaaaaaaaaaaa");
const KEY_B = btoa("identity-key-bbbbbbbbbbbbbbbbbbbbbbbb");
const PLAIN = "ab@astermail.org";
const VARIANT = " A.B+news@Astermail.org";
const TAGGED = "a.b+news@astermail.org";
const DOTTED = "a.b@astermail.org";
const STRANGER = "newperson@astermail.org";
const OTHER = "someone.else+shop@astermail.org";
const LONG_PLAIN = "abcdefghijklmn@astermail.org";
const LONG_DOTTED = "a.b.c.d.e.f.g.h.i.j.k.l.m.n@astermail.org";
const CUSTOM_DOMAIN = "custom.example";

function current_name(prefix: string, id: string): Promise<string> {
  return canonical_storage_name(prefix, "acct-1", id);
}

function earlier_name(prefix: string, spelling: string): Promise<string> {
  return scoped_storage_name(prefix, "acct-1", spelling);
}

async function identity_pin(key: string) {
  return {
    fingerprint: await compute_hash(base64_to_array(key)),
    verified: false,
    pinned_at: 1,
  };
}

function place(name: string, value: unknown): string {
  h.store.set(name, value);
  forget_stored_names();

  return name;
}

async function seed_earlier_pin(spelling: string, key: string) {
  return place(
    await earlier_name(IDENTITY_PIN_PREFIX, spelling),
    await identity_pin(key),
  );
}

async function seed_current_pin(id: string, key: string) {
  return place(
    await current_name(IDENTITY_PIN_PREFIX, id),
    await identity_pin(key),
  );
}

async function seed_earlier_owner_pin(spelling: string, armored: string) {
  return place(await earlier_name(OWNER_KEY_PIN_PREFIX, spelling), {
    fingerprint: await owner_key_fingerprint(armored),
    pinned_at: 1,
  });
}

async function pinned_fingerprint(peer: string): Promise<string | null> {
  const found = await lookup_identity_pin_record(peer);

  return found && found !== "unreadable" ? found.fingerprint : null;
}

function names_under(prefix: string): string[] {
  return [...h.store.keys()].filter((name) => name.startsWith(prefix));
}

async function make_public_key(): Promise<string> {
  const { publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: PLAIN }],
    format: "armored",
  });

  return publicKey;
}

beforeEach(() => {
  h.store.clear();
  h.unreadable.clear();
  h.hosted_domains = new Set([CUSTOM_DOMAIN]);
  h.classification_down = false;
  clear_ratchet_verification_status();
  reset_storage_name_state();
  reset_contact_entry_state();
  h.list_calls = 0;
  h.read_calls = 0;
});

describe("canonical pin id", () => {
  it("folds dots and the tag only where the server delivers to one mailbox", () => {
    expect(canonical_pin_id(VARIANT, "builtin")).toBe(PLAIN);
    expect(canonical_pin_id("J.Doe+Shop@Custom.Example", "hosted")).toBe(
      "j.doe@custom.example",
    );
    expect(canonical_pin_id(" J.Doe+Shop@Example.com ", "external")).toBe(
      "j.doe+shop@example.com",
    );
  });

  it("lists every dotted spelling of a short local part", () => {
    expect(dotted_spellings(PLAIN, 10)).toEqual([DOTTED]);
    expect(dotted_spellings("abc@astermail.org", 10).sort()).toEqual([
      "a.b.c@astermail.org",
      "a.bc@astermail.org",
      "ab.c@astermail.org",
    ]);
    expect(dotted_spellings("abcdefgh@astermail.org", 5)).toHaveLength(5);
    expect(dotted_spellings("a@astermail.org", 10)).toEqual([]);
  });

  it("describes a contact by kind", () => {
    const builtin = describe_pin_contact(VARIANT, "builtin");
    const external = describe_pin_contact("J.Doe@Example.com", "external");

    expect(builtin.id).toBe(PLAIN);
    expect(builtin.spellings).toContain(TAGGED);
    expect(builtin.spellings).toContain(PLAIN);
    expect(external).toEqual({
      id: "j.doe@example.com",
      kind: "external",
      spellings: ["j.doe@example.com"],
    });
  });

  it("classifies a contact by the domain it is delivered through", async () => {
    expect((await resolve_pin_contact(DOTTED))?.kind).toBe("builtin");
    expect((await resolve_pin_contact("j.doe@aster.cx"))?.id).toBe(
      "jdoe@aster.cx",
    );
    expect((await resolve_pin_contact(`j.doe+x@${CUSTOM_DOMAIN}`))?.id).toBe(
      `j.doe@${CUSTOM_DOMAIN}`,
    );
    expect((await resolve_pin_contact("j.doe+x@example.com"))?.id).toBe(
      "j.doe+x@example.com",
    );
    expect((await resolve_pin_contact("alice"))?.kind).toBe("external");
  });

  it("names no contact while the domain cannot be classified", async () => {
    h.classification_down = true;

    expect(await resolve_pin_contact("j.doe@unknown.example")).toBeNull();
    expect((await resolve_pin_contact(DOTTED))?.id).toBe(PLAIN);
  });
});

describe("identity pin across address variants", () => {
  it("resolves a dotted and tagged variant to the existing pin", async () => {
    expect(await check_and_pin_identity(PLAIN, KEY_A)).toBe("first");
    expect(await check_and_pin_identity(VARIANT, KEY_A)).toBe("ok");
    expect(await check_and_pin_identity(DOTTED, KEY_A)).toBe("ok");
    expect(names_under(IDENTITY_PIN_PREFIX)).toEqual([
      await current_name(IDENTITY_PIN_PREFIX, PLAIN),
    ]);
  });

  it("reports a key change when a variant presents a different key", async () => {
    await check_and_pin_identity(PLAIN, KEY_A);

    const pinned = await pinned_fingerprint(PLAIN);

    expect(await check_and_pin_identity(VARIANT, KEY_B)).toBe("drift");
    expect(await pinned_fingerprint(VARIANT)).toBe(pinned);
  });

  it("pins a new contact on first use when nothing earlier is stored", async () => {
    expect(await check_and_pin_identity(STRANGER, KEY_A)).toBe("first");
    expect(await get_recipient_pin_health(STRANGER)).toBe("settled");
  });

  it("finds a pin saved under a dotted spelling from the plain address", async () => {
    const dotted_name = await seed_earlier_pin(DOTTED, KEY_A);

    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("drift");
    expect(await check_and_pin_identity(PLAIN, KEY_A)).toBe("ok");
    expect(h.store.has(dotted_name)).toBe(false);
    expect(h.store.has(await current_name(IDENTITY_PIN_PREFIX, PLAIN))).toBe(
      true,
    );
    expect(await get_recipient_pin_health(DOTTED)).toBe("settled");
  });

  it("finds a tagged pin saved under a readable name from the plain address", async () => {
    const readable_name = place(
      `${IDENTITY_PIN_PREFIX}acct-1_${TAGGED}`,
      await identity_pin(KEY_A),
    );

    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("drift");
    expect(await check_and_pin_identity(PLAIN, KEY_A)).toBe("ok");
    expect(h.store.has(readable_name)).toBe(false);
  });

  it("pins a first contact while an earlier tagged pin cannot be attributed", async () => {
    const tagged_name = await seed_earlier_pin(TAGGED, KEY_A);

    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("first");
    expect(await get_recipient_pin_health(PLAIN)).toBe("settled");
    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(false);
    expect(h.store.has(tagged_name)).toBe(true);
    expect(await check_and_pin_identity(TAGGED, KEY_B)).toBe("drift");
  });

  it("pins a first contact past the dotted spellings it can list", async () => {
    const dotted_name = await seed_earlier_pin(LONG_DOTTED, KEY_A);

    expect(await check_and_pin_identity(LONG_PLAIN, KEY_B)).toBe("first");
    expect(h.store.has(dotted_name)).toBe(true);
    expect(await check_and_pin_identity(LONG_DOTTED, KEY_B)).toBe("drift");
  });

  it("pins a new contact while earlier entries belong to other contacts", async () => {
    await seed_earlier_pin(OTHER, KEY_A);

    expect(await check_and_pin_identity(STRANGER, KEY_B)).toBe("first");
    expect(await get_recipient_pin_health(STRANGER)).toBe("settled");
    expect(await is_recipient_flagged_untrusted(STRANGER)).toBe(false);
    expect(await check_and_pin_identity(STRANGER, KEY_B)).toBe("ok");
    expect(await check_and_pin_identity(STRANGER, KEY_A)).toBe("drift");
    expect(await check_and_pin_identity(OTHER, KEY_A)).toBe("ok");
  });

  it("treats spellings pinned to different keys as a key change", async () => {
    const dotted_name = await seed_earlier_pin(DOTTED, KEY_A);
    const plain_name = await seed_current_pin(PLAIN, KEY_B);

    expect(await check_and_pin_identity(PLAIN, KEY_A)).toBe("drift");
    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("drift");
    expect(h.store.has(dotted_name)).toBe(true);
    expect(h.store.has(plain_name)).toBe(true);
    expect(await get_recipient_pin_health(PLAIN)).toBe("conflict");
  });

  it("clears every spelling once the keys are trusted", async () => {
    const dotted_name = await seed_earlier_pin(DOTTED, KEY_A);
    const tagged_name = await seed_earlier_pin(TAGGED, KEY_A);

    await seed_current_pin(PLAIN, KEY_B);
    await trust_recipient_keys(TAGGED, KEY_B, null);

    expect(h.store.has(dotted_name)).toBe(false);
    expect(h.store.has(tagged_name)).toBe(false);
    expect(names_under(IDENTITY_PIN_PREFIX)).toEqual([
      await current_name(IDENTITY_PIN_PREFIX, PLAIN),
    ]);
    expect(await get_recipient_pin_health(PLAIN)).toBe("settled");
    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("ok");
  });

  it("shares the untrusted flag across variants", async () => {
    place(await earlier_name(IDENTITY_UNTRUSTED_PREFIX, DOTTED), {
      flagged_at: 1,
      version: 2,
    });

    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(true);
    expect(await is_recipient_flagged_untrusted(VARIANT)).toBe(true);
  });
});

describe("contacts on other domains", () => {
  it("folds only the tag on a hosted custom domain", async () => {
    const dotted = `j.doe@${CUSTOM_DOMAIN}`;

    expect(await check_and_pin_identity(dotted, KEY_A)).toBe("first");
    expect(
      await check_and_pin_identity(`J.Doe+shop@${CUSTOM_DOMAIN}`, KEY_B),
    ).toBe("drift");
    expect(await check_and_pin_identity(`jdoe@${CUSTOM_DOMAIN}`, KEY_B)).toBe(
      "first",
    );
    expect(await pinned_fingerprint(dotted)).toBe(
      (await identity_pin(KEY_A)).fingerprint,
    );
  });

  it("folds nothing for an external address", async () => {
    expect(await check_and_pin_identity("j.doe@example.com", KEY_A)).toBe(
      "first",
    );
    expect(await check_and_pin_identity("jdoe@example.com", KEY_B)).toBe(
      "first",
    );
    expect(await check_and_pin_identity("j.doe+x@example.com", KEY_B)).toBe(
      "first",
    );
    expect(await check_and_pin_identity(" J.Doe@Example.com", KEY_B)).toBe(
      "drift",
    );
  });

  it("lets an external contact start fresh beside unattributed earlier entries", async () => {
    await seed_earlier_pin(OTHER, KEY_A);

    expect(await check_and_pin_identity("j.doe@example.com", KEY_A)).toBe(
      "first",
    );
  });

  it("remembers nothing while the domain cannot be classified", async () => {
    h.classification_down = true;

    expect(await check_and_pin_identity("j.doe@unknown.example", KEY_A)).toBe(
      "unknown",
    );
    expect(await lookup_identity_pin_record("j.doe@unknown.example")).toBe(
      "unreadable",
    );
    expect(await get_recipient_pin_health("j.doe@unknown.example")).toBe(
      "unreadable",
    );
    await expect(
      is_recipient_flagged_untrusted("j.doe@unknown.example"),
    ).rejects.toBeInstanceOf(KeyPinUnavailableError);
    expect(names_under(IDENTITY_PIN_PREFIX)).toEqual([]);

    h.classification_down = false;

    expect(await check_and_pin_identity("j.doe@unknown.example", KEY_A)).toBe(
      "first",
    );
  });

  it("keys contact key events by the canonical address only where it folds", async () => {
    await check_and_pin_identity(DOTTED, KEY_A);
    await check_and_pin_identity(VARIANT, KEY_A);
    await check_and_pin_identity("j.doe@example.com", KEY_A);
    await check_and_pin_identity("jdoe@example.com", KEY_A);

    record_peer_identity_event(DOTTED, "rotated");
    record_peer_identity_event("j.doe@example.com", "rotated");

    expect(get_peer_identity_event(PLAIN)?.event).toBe("rotated");
    expect(get_peer_identity_event(VARIANT)?.event).toBe("rotated");
    expect(get_peer_identity_event("jdoe@example.com")).toBeNull();

    dismiss_peer_identity_event(VARIANT);

    expect(get_peer_identity_event(DOTTED)).toBeNull();
    expect(get_peer_identity_event("j.doe@example.com")?.event).toBe("rotated");
  });
});

describe("unreadable pin entries", () => {
  it("does not treat an unreadable identity pin as first contact", async () => {
    const name = await seed_current_pin(PLAIN, KEY_A);
    const stored = h.store.get(name);

    h.unreadable.add(name);

    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("unreadable");
    expect(await check_and_pin_identity(VARIANT, KEY_B)).toBe("unreadable");
    expect(await lookup_identity_pin_record(PLAIN)).toBe("unreadable");
    expect(h.store.get(name)).toEqual(stored);
    expect(await get_recipient_pin_health(PLAIN)).toBe("unreadable");
  });

  it("reports an unreadable pin under every earlier name format", async () => {
    const formats = [
      await earlier_name(IDENTITY_PIN_PREFIX, PLAIN),
      `${IDENTITY_PIN_PREFIX}acct-1_${PLAIN}`,
      `${IDENTITY_PIN_PREFIX}${PLAIN}`,
      await scoped_storage_name(IDENTITY_PIN_PREFIX, null, PLAIN),
    ];

    expect(new Set(formats).size).toBe(4);

    for (const name of formats) {
      place(name, await identity_pin(KEY_A));
      h.unreadable.add(name);
      reset_contact_entry_state();

      expect([name, await check_and_pin_identity(PLAIN, KEY_B)]).toEqual([
        name,
        "unreadable",
      ]);
      expect(await lookup_identity_pin_record(PLAIN)).toBe("unreadable");
      expect(await get_recipient_pin_health(PLAIN)).toBe("unreadable");
      expect(h.store.has(await current_name(IDENTITY_PIN_PREFIX, PLAIN))).toBe(
        false,
      );

      h.unreadable.delete(name);
      h.store.delete(name);
      forget_stored_names();
    }
  });

  it("reports an unreadable pin saved under a dotted spelling", async () => {
    h.unreadable.add(await seed_earlier_pin(DOTTED, KEY_A));

    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("unreadable");
  });

  it("reports unreadable sender history apart from an empty one", async () => {
    const slot = await open_pin_contact(PLAIN);

    if (!slot) throw new Error("no contact");

    expect((await read_sender_history(slot)).state).toBe("absent");

    const name = place(await current_name(SENDER_HISTORY_PREFIX, PLAIN), [
      KEY_A,
    ]);

    expect(await read_sender_history(slot)).toMatchObject({
      state: "found",
      value: [KEY_A],
    });

    h.unreadable.add(name);

    expect((await read_sender_history(slot)).state).toBe("unreadable");
    expect(await get_recipient_pin_health(PLAIN)).toBe("unreadable");

    h.unreadable.delete(name);
    h.store.delete(name);
    h.unreadable.add(
      place(await earlier_name(SENDER_HISTORY_PREFIX, DOTTED), [KEY_A]),
    );

    expect((await read_sender_history(slot)).state).toBe("unreadable");
  });

  it("ignores an untrusted flag saved without a version", async () => {
    place(await current_name(IDENTITY_UNTRUSTED_PREFIX, PLAIN), {
      flagged_at: 1,
    });

    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(false);

    await flag_recipient_untrusted(PLAIN);

    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(true);
  });

  it("counts an unreadable untrusted flag as flagged", async () => {
    const name = place(await current_name(IDENTITY_UNTRUSTED_PREFIX, PLAIN), {
      flagged_at: 1,
    });

    h.unreadable.add(name);

    expect(await is_recipient_flagged_untrusted(PLAIN)).toBe(true);
  });

  it("recovers once the current keys are trusted", async () => {
    h.unreadable.add(await seed_current_pin(PLAIN, KEY_A));

    await trust_recipient_keys(PLAIN, KEY_B, null);

    expect(await get_recipient_pin_health(PLAIN)).toBe("settled");
    expect(await check_and_pin_identity(PLAIN, KEY_B)).toBe("ok");
  });
});

describe("store reads per contact", () => {
  it("lists the store once for a whole mailbox of senders", async () => {
    const senders = Array.from(
      { length: 60 },
      (_, index) => `sender${index}@astermail.org`,
    );

    for (const sender of senders.slice(0, 30)) {
      await seed_earlier_pin(sender, KEY_A);
    }

    for (let index = 0; index < 400; index += 1) {
      h.store.set(`mail_cache_${index}`, { index });
    }

    forget_stored_names();
    h.list_calls = 0;

    let most_reads = 0;

    for (const sender of senders) {
      h.read_calls = 0;
      await lookup_identity_pin_record(sender);
      await check_and_pin_identity(sender, KEY_A);
      await check_and_pin_identity(sender, KEY_A);
      most_reads = Math.max(most_reads, h.read_calls);
    }

    expect(h.list_calls).toBe(1);
    expect(most_reads).toBeLessThanOrEqual(12);
  });
});

describe("writes for one contact", () => {
  it("lets exactly one of several first contacts pin", async () => {
    const results = await Promise.all([
      check_and_pin_identity(PLAIN, KEY_A),
      check_and_pin_identity(VARIANT, KEY_B),
      check_and_pin_identity(DOTTED, KEY_B),
    ]);

    expect(results.filter((status) => status === "first")).toHaveLength(1);
    expect(results).not.toContain("unknown");
    expect(names_under(IDENTITY_PIN_PREFIX)).toHaveLength(1);
  });

  it("runs tasks for one contact one after another", async () => {
    const plain = await open_pin_contact(PLAIN);
    const variant = await open_pin_contact(VARIANT);
    const stranger = await open_pin_contact(STRANGER);
    const order: string[] = [];

    if (!plain || !variant || !stranger) throw new Error("no contact");

    const step = (label: string, wait: number) => async () => {
      order.push(`${label} start`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      order.push(`${label} end`);
    };

    await Promise.all([
      with_contact_lock(plain, step("one", 30)),
      with_contact_lock(variant, step("two", 30)),
      with_contact_lock(stranger, step("apart", 1)),
    ]);

    const shared = order.filter((entry) => !entry.startsWith("apart"));

    expect(shared.map((entry) => entry.split(" ")[1])).toEqual([
      "start",
      "end",
      "start",
      "end",
    ]);
    expect(shared[0].split(" ")[0]).toBe(shared[1].split(" ")[0]);
    expect(order.indexOf("apart end")).toBeLessThan(order.indexOf(shared[1]));
  });

  it("keeps the queue moving after a task fails", async () => {
    const slot = await open_pin_contact(PLAIN);

    if (!slot) throw new Error("no contact");

    await expect(
      with_contact_lock(slot, async () => {
        throw new Error("write failed");
      }),
    ).rejects.toThrow("write failed");
    expect(await with_contact_lock(slot, async () => "next")).toBe("next");
  });

  it("holds a lock shared with other tabs when the browser offers one", async () => {
    const slot = await open_pin_contact(PLAIN);
    const held: string[] = [];

    if (!slot) throw new Error("no contact");

    vi.stubGlobal("navigator", {
      locks: {
        request: async (name: string, task: () => Promise<unknown>) => {
          held.push(name);

          return task();
        },
      },
    });

    try {
      expect(await with_contact_lock(slot, async () => "done")).toBe("done");
    } finally {
      vi.unstubAllGlobals();
    }

    expect(held).toHaveLength(1);
    expect(held[0].includes(PLAIN)).toBe(false);
  });
});

describe("owner key pin across address variants", () => {
  let owner_a = "";
  let owner_b = "";

  beforeAll(async () => {
    owner_a = await make_public_key();
    owner_b = await make_public_key();
  });

  it("resolves a variant to the existing owner pin", async () => {
    expect(await check_owner_key_pin(PLAIN, owner_a)).toBe("first");
    expect(await check_owner_key_pin(VARIANT, owner_a)).toBe("ok");
    expect(await check_owner_key_pin(VARIANT, owner_b)).toBe("changed");
  });

  it("finds an owner pin saved under a dotted spelling from the plain address", async () => {
    const dotted_name = await seed_earlier_owner_pin(DOTTED, owner_a);

    expect(await check_owner_key_pin(PLAIN, owner_b)).toBe("changed");
    expect(await check_owner_key_pin(PLAIN, owner_a)).toBe("ok");
    expect(h.store.has(dotted_name)).toBe(false);
  });

  it("reports a change when spellings hold different owner keys", async () => {
    await seed_earlier_owner_pin(DOTTED, owner_a);
    place(await current_name(OWNER_KEY_PIN_PREFIX, PLAIN), {
      fingerprint: await owner_key_fingerprint(owner_b),
      pinned_at: 1,
    });

    expect(await check_owner_key_pin(PLAIN, owner_a)).toBe("changed");
    expect(await check_owner_key_pin(PLAIN, owner_b)).toBe("changed");
    expect(await lookup_owner_key_pin(PLAIN)).toMatchObject({
      conflict: true,
    });
  });

  it("refuses an unreadable owner pin instead of pinning again", async () => {
    const name = place(await current_name(OWNER_KEY_PIN_PREFIX, PLAIN), {
      fingerprint: await owner_key_fingerprint(owner_a),
      pinned_at: 1,
    });

    h.unreadable.add(name);

    await expect(check_owner_key_pin(PLAIN, owner_b)).rejects.toBeInstanceOf(
      RecipientPinUnreadableError,
    );
    await expect(check_owner_key_pin(VARIANT, owner_b)).rejects.toBeInstanceOf(
      KeyPinUnavailableError,
    );
    expect(await lookup_owner_key_pin(PLAIN)).toBe("unreadable");
    expect(h.unreadable.has(name)).toBe(true);
  });

  it("pins a first owner key while an earlier tagged pin cannot be attributed", async () => {
    const tagged_name = await seed_earlier_owner_pin(TAGGED, owner_a);

    expect(await check_owner_key_pin(PLAIN, owner_b)).toBe("first");
    expect(await check_owner_key_pin(PLAIN, owner_b)).toBe("ok");
    expect(await check_owner_key_pin(PLAIN, owner_a)).toBe("changed");
    expect(h.store.has(tagged_name)).toBe(true);
    expect(await check_owner_key_pin(TAGGED, owner_b)).toBe("changed");
  });

  it("keeps external owner pins on the address as typed", async () => {
    expect(await check_owner_key_pin("j.doe@example.com", owner_a)).toBe(
      "first",
    );
    expect(await check_owner_key_pin("jdoe@example.com", owner_b)).toBe(
      "first",
    );
    expect(await lookup_owner_key_pin("j.doe@example.com")).toMatchObject({
      fingerprint: await owner_key_fingerprint(owner_a),
      conflict: false,
    });
  });

  it("refuses an owner pin while the domain cannot be classified", async () => {
    h.classification_down = true;

    await expect(
      check_owner_key_pin("j.doe@unknown.example", owner_a),
    ).rejects.toBeInstanceOf(KeyPinUnavailableError);
    expect(await lookup_owner_key_pin("j.doe@unknown.example")).toBe(
      "unreadable",
    );
    expect(names_under(OWNER_KEY_PIN_PREFIX)).toEqual([]);
  });
});
