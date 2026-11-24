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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  changes: new Map<
    string,
    {
      prior_fingerprint: string;
      new_fingerprint: string;
      source: string;
      observed_at: string;
    } | null
  >(),
  discover_error: false,
  discover_api_error: false,
  acknowledged: [] as string[][],
  public_keys: new Map<string, string>(),
  store: new Map<string, unknown>(),
  unreadable: new Set<string>(),
  fail_reads: false,
  keyless: new Set<string>(),
  hosted: new Set<string>(),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "acct-1",
}));

vi.mock("@/services/recipient_classification", () => ({
  is_internal_recipient: (email: string) =>
    email.toLowerCase().endsWith("@astermail.org") ||
    h.hosted.has(email.toLowerCase()),
  get_cached_recipient_classification: () => undefined,
  classify_recipients: async (emails: string[]) =>
    new Map(
      emails.map((email) => [
        email,
        h.hosted.has(email.toLowerCase()) ? "internal" : "external",
      ]),
    ),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(32).fill(3),
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: () => undefined,
}));

vi.mock("@/services/crypto/openpgp_loader", () => ({
  load_openpgp: async () => ({
    readKey: async ({ armoredKey }: { armoredKey: string }) => ({
      getFingerprint: () => `fp_${armoredKey}`,
    }),
  }),
}));

vi.mock("@/services/crypto/encrypted_storage", async () => ({
  ...(
    await import("@/tests/fixtures/storage_name_support")
  ).storage_name_support(h.store),
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
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    discover_external_keys_batch: vi.fn(async (emails: string[]) => {
      if (h.discover_error) throw new Error("network");

      if (h.discover_api_error) return { error: "unavailable" };

      return {
        data: emails.map((email) =>
          h.keyless.has(email)
            ? {
                email,
                found: false,
                public_key: null,
                fingerprint: null,
                source: null,
                expires_at: null,
                will_encrypt: false,
                fingerprint_change: null,
              }
            : {
                email,
                found: true,
                public_key: h.public_keys.get(email) ?? "key",
                fingerprint: "ffff",
                source: "wkd",
                expires_at: null,
                will_encrypt: true,
                fingerprint_change: h.changes.get(email) ?? null,
              },
        ),
      };
    }),
    acknowledge_external_key_fingerprint_change: vi.fn(
      async (email: string, prior: string, next: string) => {
        h.acknowledged.push([email, prior, next]);

        return { data: { acknowledged: true } };
      },
    ),
  };
});

import { discover_external_keys_batch } from "@/services/api/keys";
import { reset_contact_entry_state } from "@/services/crypto/contact_entries";
import {
  check_and_pin_identity,
  check_owner_key_pin,
  lookup_owner_key_pin,
} from "@/services/crypto/ratchet_identity_pin";
import {
  OWNER_KEY_PIN_PREFIX,
  reset_storage_name_state,
} from "@/services/crypto/storage_key_names";
import {
  ensure_external_key_trust,
  find_key_fingerprint_changes,
  KeyTrustCheckError,
  set_key_trust_prompt_handler,
  type KeyFingerprintChange,
} from "@/services/key_trust_consent";

const settled = "settled@example.com";
const rotated = "rotated@example.com";
const internal = "someone@astermail.org";

const change = {
  prior_fingerprint: "aaaabbbbccccdddd",
  new_fingerprint: "FP_1111222233334444",
  source: "wkd",
  observed_at: "2026-09-15T00:00:00Z",
};

async function pinned_fingerprint(email: string): Promise<string | null> {
  const pinned = await lookup_owner_key_pin(email);

  if (pinned === "unreadable") return "unreadable";

  return pinned ? pinned.fingerprint : null;
}

function make_saved_pins_unreadable(): number {
  const names = [...h.store.keys()].filter((name) =>
    name.startsWith(OWNER_KEY_PIN_PREFIX),
  );

  for (const name of names) h.unreadable.add(name);

  return names.length;
}

describe("external key trust consent", () => {
  beforeEach(() => {
    h.changes.clear();
    h.discover_error = false;
    h.discover_api_error = false;
    h.acknowledged = [];
    h.public_keys.clear();
    h.store.clear();
    h.unreadable.clear();
    h.fail_reads = false;
    h.keyless.clear();
    h.hosted.clear();
    reset_storage_name_state();
    reset_contact_entry_state();
    vi.mocked(discover_external_keys_batch).mockClear();
    set_key_trust_prompt_handler(null);
  });

  it("sends without a prompt when no key has changed", async () => {
    let prompted = false;

    set_key_trust_prompt_handler(async () => {
      prompted = true;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompted).toBe(false);
  });

  it("never looks up a key for an internal recipient", async () => {
    await expect(ensure_external_key_trust([internal])).resolves.toBe(true);
    expect(discover_external_keys_batch).not.toHaveBeenCalled();
  });

  it("shows the fingerprint of the delivered key in the prompt", async () => {
    h.changes.set(rotated, change);

    const seen: string[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      for (const entry of pending) {
        seen.push(entry.email, entry.prior_fingerprint, entry.new_fingerprint);
      }

      return true;
    });

    await ensure_external_key_trust([rotated]);

    expect(seen).toEqual([rotated, change.prior_fingerprint, "FP_KEY"]);
    expect(h.acknowledged).toEqual([
      [rotated, change.prior_fingerprint, change.new_fingerprint],
    ]);
  });

  it("names both fingerprints in the prompt", async () => {
    h.changes.set(rotated, change);
    h.public_keys.set(rotated, change.new_fingerprint.slice(3));

    const seen: string[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      for (const entry of pending) {
        seen.push(entry.email, entry.prior_fingerprint, entry.new_fingerprint);
      }

      return true;
    });

    await ensure_external_key_trust([settled, rotated]);

    expect(seen).toEqual([
      rotated,
      change.prior_fingerprint,
      change.new_fingerprint,
    ]);
  });

  it("blocks the send and records nothing when the change is rejected", async () => {
    h.changes.set(rotated, change);

    set_key_trust_prompt_handler(async () => false);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(false);
    expect(h.acknowledged).toEqual([]);
  });

  it("acknowledges the change once the user trusts the new key", async () => {
    h.changes.set(rotated, change);

    set_key_trust_prompt_handler(async () => true);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(true);
    expect(h.acknowledged).toEqual([
      [rotated, change.prior_fingerprint, change.new_fingerprint],
    ]);
  });

  it("blocks the send when no prompt can be shown", async () => {
    h.changes.set(rotated, change);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(false);
    expect(h.acknowledged).toEqual([]);
  });

  it("blocks the send when the key lookup throws", async () => {
    h.changes.set(rotated, change);
    h.discover_error = true;

    await expect(ensure_external_key_trust([rotated])).rejects.toBeInstanceOf(
      KeyTrustCheckError,
    );
  });

  it("blocks the send when the key lookup returns an error", async () => {
    h.discover_api_error = true;

    await expect(ensure_external_key_trust([settled])).rejects.toBeInstanceOf(
      KeyTrustCheckError,
    );
  });

  it("pins each external key on its first trusted send", async () => {
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(await pinned_fingerprint(settled)).toBe("fp_key");
  });

  it("asks before using a key that differs from this device's pin", async () => {
    await check_owner_key_pin(settled, "key");
    h.public_keys.set(settled, "swapped");

    const seen: string[][] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(
        ...pending.map((entry) => [
          entry.email,
          entry.prior_fingerprint,
          entry.new_fingerprint,
        ]),
      );

      return false;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toEqual([[settled, "FP_KEY", "FP_SWAPPED"]]);
    expect(await pinned_fingerprint(settled)).toBe("fp_key");
  });

  it("repins locally without a server acknowledgement once trusted", async () => {
    await check_owner_key_pin(settled, "key");
    h.public_keys.set(settled, "swapped");

    set_key_trust_prompt_handler(async () => true);

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(await pinned_fingerprint(settled)).toBe("fp_swapped");
    expect(h.acknowledged).toEqual([]);
  });

  it("repins a server-reported change once trusted", async () => {
    await check_owner_key_pin(rotated, "old");
    h.changes.set(rotated, change);

    set_key_trust_prompt_handler(async () => true);

    await expect(ensure_external_key_trust([rotated])).resolves.toBe(true);
    expect(await pinned_fingerprint(rotated)).toBe("fp_key");
  });

  it("stops the send and asks when the saved pin cannot be read", async () => {
    await check_owner_key_pin(settled, "key");
    expect(make_saved_pins_unreadable()).toBe(1);

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      email: settled,
      prior_fingerprint: "",
      new_fingerprint: "FP_KEY",
      unreadable: true,
    });
    expect(await pinned_fingerprint(settled)).toBe("unreadable");
  });

  it("reports an unreadable pin to callers that only look for changes", async () => {
    await check_owner_key_pin(settled, "key");
    make_saved_pins_unreadable();

    expect(await find_key_fingerprint_changes([settled])).toMatchObject([
      { email: settled, unreadable: true },
    ]);
  });

  it("does not send past an unreadable pin when no prompt can be shown", async () => {
    await check_owner_key_pin(settled, "key");
    make_saved_pins_unreadable();

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
  });

  it("sends again once the user trusts the key after an unreadable pin", async () => {
    await check_owner_key_pin(settled, "key");
    make_saved_pins_unreadable();

    let prompts = 0;

    set_key_trust_prompt_handler(async () => {
      prompts += 1;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(await pinned_fingerprint(settled)).toBe("fp_key");
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompts).toBe(1);
  });

  it("stops the send when the pin store cannot be read at all", async () => {
    h.fail_reads = true;

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toMatchObject([{ email: settled, unreadable: true }]);
    expect(h.store.size).toBe(0);
  });

  it("retries a failed key lookup once before blocking the send", async () => {
    vi.mocked(discover_external_keys_batch).mockResolvedValueOnce({
      error: "unavailable",
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
  });

  it("sends without a prompt when a recipient never had a key", async () => {
    h.keyless.add(settled);

    let prompts = 0;

    set_key_trust_prompt_handler(async () => {
      prompts += 1;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompts).toBe(0);
    expect(await pinned_fingerprint(settled)).toBeNull();
  });

  it("asks before sending when a saved key is no longer available", async () => {
    await check_owner_key_pin(settled, "key");
    h.keyless.add(settled);

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toMatchObject([
      {
        email: settled,
        prior_fingerprint: "FP_KEY",
        new_fingerprint: "",
        missing: true,
      },
    ]);
    expect(await pinned_fingerprint(settled)).toBe("fp_key");
    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toHaveLength(2);
  });

  it("asks before sending when the saved key cannot be read and none is available", async () => {
    await check_owner_key_pin(settled, "key");
    expect(make_saved_pins_unreadable()).toBe(1);
    h.keyless.add(settled);

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toMatchObject([
      {
        email: settled,
        prior_fingerprint: "",
        new_fingerprint: "",
        missing: true,
        unreadable: true,
      },
    ]);
    await expect(find_key_fingerprint_changes([settled])).resolves.toMatchObject(
      [{ email: settled, missing: true, unreadable: true }],
    );
  });

  it("does not send past an unreadable saved key with no key and no prompt", async () => {
    await check_owner_key_pin(settled, "key");
    make_saved_pins_unreadable();
    h.keyless.add(settled);

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
  });

  it("keeps asking while the saved key cannot be read", async () => {
    await check_owner_key_pin(settled, "key");
    make_saved_pins_unreadable();
    h.keyless.add(settled);

    let prompts = 0;

    set_key_trust_prompt_handler(async () => {
      prompts += 1;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompts).toBe(2);
    expect(await pinned_fingerprint(settled)).toBe("unreadable");
  });

  it("reports a missing saved key to callers that only look for changes", async () => {
    await check_owner_key_pin(settled, "key");
    h.keyless.add(settled);

    await expect(find_key_fingerprint_changes([settled])).resolves.toMatchObject(
      [{ email: settled, missing: true }],
    );
  });

  it("does not send past a missing saved key when no prompt can be shown", async () => {
    await check_owner_key_pin(settled, "key");
    h.keyless.add(settled);

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
  });

  it("asks once and keeps the saved key when the user sends anyway", async () => {
    await check_owner_key_pin(settled, "key");
    h.keyless.add(settled);

    let prompts = 0;

    set_key_trust_prompt_handler(async () => {
      prompts += 1;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompts).toBe(1);
    expect(await pinned_fingerprint(settled)).toBe("fp_key");
    expect(h.acknowledged).toEqual([]);
  });

  it("asks about a different key that appears after sending without one", async () => {
    await check_owner_key_pin(settled, "key");
    h.keyless.add(settled);
    set_key_trust_prompt_handler(async () => true);
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);

    h.keyless.clear();
    h.public_keys.set(settled, "swapped");

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(false);
    expect(seen).toMatchObject([
      {
        email: settled,
        prior_fingerprint: "FP_KEY",
        new_fingerprint: "FP_SWAPPED",
      },
    ]);
    expect(seen[0].missing).toBeUndefined();
  });

  it("asks again when the same key returns and then goes missing", async () => {
    await check_owner_key_pin(settled, "key");
    h.keyless.add(settled);

    let prompts = 0;

    set_key_trust_prompt_handler(async () => {
      prompts += 1;

      return true;
    });

    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    h.keyless.clear();
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompts).toBe(1);
    h.keyless.add(settled);
    await expect(ensure_external_key_trust([settled])).resolves.toBe(true);
    expect(prompts).toBe(2);
  });

  it("asks when a contact with a saved identity is no longer hosted", async () => {
    const moved = "moved@example.org";

    h.hosted.add(moved);
    await expect(
      check_and_pin_identity(moved, btoa("identity-key-material")),
    ).resolves.toBe("first");
    h.hosted.clear();
    h.keyless.add(moved);

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return true;
    });

    await expect(ensure_external_key_trust([moved])).resolves.toBe(true);
    expect(seen).toMatchObject([{ email: moved, missing: true }]);
    await expect(ensure_external_key_trust([moved])).resolves.toBe(true);
    expect(seen).toHaveLength(1);

    h.hosted.add(moved);
    await expect(ensure_external_key_trust([moved])).resolves.toBe(true);
    h.hosted.clear();
    await expect(ensure_external_key_trust([moved])).resolves.toBe(true);
    expect(seen).toHaveLength(2);
  });

  it("asks when a tagged address of a hosted contact returns a different key", async () => {
    const base = "bob@custom.example";
    const tagged = "bob+news@custom.example";

    h.hosted.add(base);
    await expect(check_owner_key_pin(base, "old")).resolves.toBe("first");
    h.public_keys.set(tagged, "new");

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([tagged])).resolves.toBe(false);
    expect(seen).toMatchObject([
      { email: tagged, prior_fingerprint: "FP_OLD", new_fingerprint: "FP_NEW" },
    ]);
    await expect(pinned_fingerprint(tagged)).resolves.toBeNull();
    await expect(pinned_fingerprint(base)).resolves.toBe("fp_old");
  });

  it("sends to a tagged address of a hosted contact when the key matches", async () => {
    const base = "bob@custom.example";
    const tagged = "bob+news@custom.example";

    h.hosted.add(base);
    await check_owner_key_pin(base, "same");
    h.public_keys.set(tagged, "same");

    let prompted = false;

    set_key_trust_prompt_handler(async () => {
      prompted = true;

      return true;
    });

    await expect(ensure_external_key_trust([tagged])).resolves.toBe(true);
    expect(prompted).toBe(false);
  });

  it("asks once for a tagged address and keeps the trusted key", async () => {
    const base = "bob@custom.example";
    const tagged = "bob+news@custom.example";

    h.hosted.add(base);
    await check_owner_key_pin(base, "old");
    h.public_keys.set(tagged, "new");

    let prompts = 0;

    set_key_trust_prompt_handler(async () => {
      prompts += 1;

      return true;
    });

    await expect(ensure_external_key_trust([tagged])).resolves.toBe(true);
    await expect(ensure_external_key_trust([tagged])).resolves.toBe(true);
    expect(prompts).toBe(1);
    await expect(pinned_fingerprint(tagged)).resolves.toBe("fp_new");
  });

  it("asks when a tagged address of a hosted contact has only a saved identity", async () => {
    const base = "dana@custom.example";
    const tagged = "dana+shop@custom.example";

    h.hosted.add(base);
    await check_and_pin_identity(base, btoa("identity-key-material"));
    h.public_keys.set(tagged, "new");

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([tagged])).resolves.toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ email: tagged, new_fingerprint: "FP_NEW" });
    expect(seen[0]?.prior_fingerprint).toMatch(/^[0-9A-F]+$/);
  });

  it("asks when a tagged address of a hosted contact has no key now", async () => {
    const base = "bob@custom.example";
    const tagged = "bob+news@custom.example";

    h.hosted.add(base);
    await check_owner_key_pin(base, "old");
    h.keyless.add(tagged);

    const seen: KeyFingerprintChange[] = [];

    set_key_trust_prompt_handler(async (pending) => {
      seen.push(...pending);

      return false;
    });

    await expect(ensure_external_key_trust([tagged])).resolves.toBe(false);
    expect(seen).toMatchObject([
      { email: tagged, prior_fingerprint: "FP_OLD", missing: true },
    ]);
  });

  it("keeps tagged addresses of an outside contact separate", async () => {
    const base = "carol@example.net";
    const tagged = "carol+shop@example.net";

    h.public_keys.set(base, "old");
    await expect(ensure_external_key_trust([base])).resolves.toBe(true);
    h.public_keys.set(tagged, "new");

    let prompted = false;

    set_key_trust_prompt_handler(async () => {
      prompted = true;

      return true;
    });

    await expect(ensure_external_key_trust([tagged])).resolves.toBe(true);
    expect(prompted).toBe(false);
  });
});
