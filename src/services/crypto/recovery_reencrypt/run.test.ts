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

interface PendingRecord {
  old_data_kek?: string;
  old_identity_key: string;
  done_identity_steps?: string[];
  identity_attempts?: number;
  owner_user_id?: string;
}

interface PutCall {
  url: string;
  body: Record<string, string>;
}

const h = vi.hoisted(() => ({
  responses: new Map<string, unknown>(),
  failing_gets: new Set<string>(),
  gets: [] as string[],
  puts: [] as { url: string; body: Record<string, string> }[],
  attempted_puts: [] as { url: string; body: Record<string, string> }[],
  refused_puts: new Set<string>(),
  reseal_mode: "stored",
  user_id: "user-a" as string | null,
  on_get: null as ((url: string) => void) | null,
}));

vi.mock("@/services/api/client", () => {
  const recovery_url = "/core/v1/recovery/email";
  const reseal_url = "/core/v1/recovery/email/reseal";

  const default_response = (url: string): unknown => {
    if (url.startsWith("/mail/v1/labels")) {
      return { labels: [], total: 0, has_more: false };
    }
    if (url.startsWith("/mail/v1/tags")) return { tags: [], has_more: false };
    if (url.startsWith("/mail/v1/drafts")) {
      return { items: [], has_more: false };
    }
    if (
      url === "/settings/v1/preferences" ||
      url === "/settings/v1/preferences/dev-mode" ||
      url === "/core/v1/onboarding"
    ) {
      return {};
    }

    return undefined;
  };

  const accepted = { data: { success: true }, error: undefined };

  return {
    api_client: {
      get_expected_user_id: vi.fn(() => h.user_id),
      get: vi.fn(async (url: string) => {
        h.gets.push(url);
        h.on_get?.(url);

        if (h.failing_gets.has(url)) {
          return { data: undefined, error: "unavailable", status: 400 };
        }
        if (h.responses.has(url)) {
          return { data: h.responses.get(url), error: undefined };
        }

        const fallback = default_response(url);

        return fallback === undefined
          ? { data: undefined, error: "unavailable" }
          : { data: fallback, error: undefined };
      }),
      put: vi.fn(async (url: string, body: Record<string, string>) => {
        h.attempted_puts.push({ url, body });

        if (h.refused_puts.has(url)) {
          return { data: undefined, error: "unavailable", status: 400 };
        }

        if (url === reseal_url) {
          if (h.reseal_mode === "missing_route") {
            return {
              data: undefined,
              error: "Not found",
              code: "NOT_FOUND",
              status: 404,
            };
          }
          if (h.reseal_mode === "changed") {
            return {
              data: undefined,
              error: "Conflict",
              code: "CONFLICT",
              status: 409,
              server_code: "RECOVERY_EMAIL_CHANGED",
            };
          }
          if (h.reseal_mode === "stored") {
            h.responses.set(recovery_url, {
              ...(h.responses.get(recovery_url) as object),
              encrypted_email: body.encrypted_email,
              email_nonce: body.email_nonce,
            });
          }
        }

        h.puts.push({ url, body });

        return accepted;
      }),
      post: vi.fn(async () => accepted),
      delete: vi.fn(async () => accepted),
    },
  };
});

vi.mock("../secure_storage", async (import_original) => ({
  ...(await import_original<typeof import("../secure_storage")>()),
  device_store: vi.fn(async (key: string, value: unknown) => {
    localStorage.setItem(key, JSON.stringify(value));
  }),
  device_retrieve: vi.fn(async (key: string) => {
    const raw = localStorage.getItem(key);

    return raw ? JSON.parse(raw) : null;
  }),
}));

vi.mock("../key_manager", () => ({
  hash_recovery_email: vi.fn(async (email: string) => `hash:${email}`),
}));

import { array_to_base64, base64_to_array } from "../base64";

import {
  PENDING_KEY,
  pending_storage_key,
  store_pending_reencryption,
} from "./pending";
import { check_and_run_recovery_reencryption } from "./run";

type Vault = Parameters<typeof check_and_run_recovery_reencryption>[0];

const OLD_IDENTITY_KEY = "old-identity-key";
const NEW_IDENTITY_KEY = "new-identity-key";
const OTHER_OLD_IDENTITY_KEY = "other-old-identity-key";
const RECOVERY_CONTEXT = "astermail-recovery-email-v1";
const ONBOARDING_CONTEXT = "astermail-onboarding-v1";
const RECOVERY_URL = "/core/v1/recovery/email";
const RESEAL_URL = "/core/v1/recovery/email/reseal";
const ONBOARDING_URL = "/core/v1/onboarding";
const TAGS_URL = "/mail/v1/tags?limit=100&offset=0";
const ONBOARDING_STATE = JSON.stringify({ step: 3 });
const ADDRESS = "user@example.com";

const vault = {
  identity_key: NEW_IDENTITY_KEY,
  previous_keys: [OLD_IDENTITY_KEY],
} as unknown as Vault;

async function context_key(
  identity_key: string,
  context: string,
): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity_key + context),
  );

  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(
  key: CryptoKey,
  text: string,
): Promise<{ encrypted: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );

  return {
    encrypted: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(iv),
  };
}

async function open(
  key: CryptoKey,
  encrypted: string,
  nonce: string,
): Promise<string | null> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(nonce) },
      key,
      base64_to_array(encrypted),
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function offer_onboarding(): Promise<void> {
  const sealed = await seal(
    await context_key(OLD_IDENTITY_KEY, ONBOARDING_CONTEXT),
    ONBOARDING_STATE,
  );

  h.responses.set(ONBOARDING_URL, {
    encrypted_state: sealed.encrypted,
    state_nonce: sealed.nonce,
  });
}

async function offer_recovery(
  identity_key: string,
  text: string,
): Promise<void> {
  const sealed = await seal(
    await context_key(identity_key, RECOVERY_CONTEXT),
    text,
  );

  h.responses.set(RECOVERY_URL, {
    encrypted_email: sealed.encrypted,
    email_nonce: sealed.nonce,
    verified: true,
  });
}

async function stored_recovery_under(
  identity_key: string,
): Promise<string | null> {
  const stored = h.responses.get(RECOVERY_URL) as {
    encrypted_email: string;
    email_nonce: string;
  };

  return open(
    await context_key(identity_key, RECOVERY_CONTEXT),
    stored.encrypted_email,
    stored.email_nonce,
  );
}

async function onboarding_put(): Promise<string | null> {
  const put = h.puts.find((entry) => entry.url === ONBOARDING_URL);

  if (!put) return null;

  return open(
    await context_key(NEW_IDENTITY_KEY, ONBOARDING_CONTEXT),
    put.body.encrypted_state,
    put.body.state_nonce,
  );
}

function count(calls: PutCall[], url: string): number {
  return calls.filter((entry) => entry.url === url).length;
}

async function record_of(
  old_identity_key: string,
): Promise<PendingRecord | null> {
  const raw = localStorage.getItem(await pending_storage_key(old_identity_key));

  return raw ? (JSON.parse(raw) as PendingRecord) : null;
}

async function run_times(times: number): Promise<void> {
  for (let run = 0; run < times; run += 1) {
    await check_and_run_recovery_reencryption(vault, "");
  }
}

function set_navigator_value(name: string, value: unknown): void {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

function reset_navigator_value(name: string): void {
  Reflect.deleteProperty(navigator, name);
}

describe("identity scoped steps after a reset", () => {
  beforeEach(async () => {
    localStorage.clear();
    h.responses.clear();
    h.failing_gets.clear();
    h.gets.length = 0;
    h.puts.length = 0;
    h.attempted_puts.length = 0;
    h.refused_puts.clear();
    h.reseal_mode = "stored";
    h.user_id = "user-a";
    h.on_get = null;
    await store_pending_reencryption({ old_identity_key: OLD_IDENTITY_KEY });
  });

  afterEach(() => {
    reset_navigator_value("locks");
    reset_navigator_value("onLine");
  });

  it("carries the onboarding state when the recovery blob is not an address", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, "private draft body");
    await offer_onboarding();

    await run_times(1);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(count(h.attempted_puts, RESEAL_URL)).toBe(0);
    expect(count(h.attempted_puts, RECOVERY_URL)).toBe(0);
    expect(await onboarding_put()).toBe(ONBOARDING_STATE);
    expect(record?.done_identity_steps).toContain("onboarding");
    expect(record?.done_identity_steps).not.toContain("recovery_email");
  });

  it("settles a recovery blob that the old key does not open", async () => {
    await offer_recovery("some-other-identity-key", ADDRESS);
    await offer_onboarding();

    await run_times(1);

    expect(count(h.attempted_puts, RESEAL_URL)).toBe(0);
    expect(await onboarding_put()).toBe(ONBOARDING_STATE);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("moves a verified address through the dedicated route only", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    await offer_onboarding();

    await run_times(1);

    const put = h.puts.find((entry) => entry.url === RESEAL_URL);

    expect(Object.keys(put?.body ?? {}).sort()).toEqual([
      "email_hash",
      "email_nonce",
      "encrypted_email",
    ]);
    expect(put?.body.email_hash).toBe(`hash:${ADDRESS}`);
    expect(count(h.attempted_puts, RECOVERY_URL)).toBe(0);
    expect(await stored_recovery_under(NEW_IDENTITY_KEY)).toBe(ADDRESS);
    expect(await onboarding_put()).toBe(ONBOARDING_STATE);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("waits without counting a run when the route does not exist yet", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    h.reseal_mode = "missing_route";

    await run_times(7);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.old_identity_key).toBe(OLD_IDENTITY_KEY);
    expect(record?.identity_attempts ?? 0).toBe(0);
    expect(record?.done_identity_steps).not.toContain("recovery_email");
    expect(record?.done_identity_steps).toContain("onboarding");
    expect(count(h.attempted_puts, RESEAL_URL)).toBe(7);
    expect(count(h.attempted_puts, RECOVERY_URL)).toBe(0);
    expect(await stored_recovery_under(OLD_IDENTITY_KEY)).toBe(ADDRESS);

    h.reseal_mode = "stored";

    await run_times(1);

    expect(await stored_recovery_under(NEW_IDENTITY_KEY)).toBe(ADDRESS);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("does not mark the address moved when the read back still needs the old key", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    h.reseal_mode = "accepted_not_stored";

    await run_times(1);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(count(h.puts, RESEAL_URL)).toBe(1);
    expect(record?.done_identity_steps).not.toContain("recovery_email");
    expect(record?.identity_attempts).toBe(1);
    expect(record?.old_identity_key).toBe(OLD_IDENTITY_KEY);
  });

  it("does not mark the address moved when the stored address changed", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    h.reseal_mode = "changed";

    await run_times(1);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.done_identity_steps).not.toContain("recovery_email");
    expect(await stored_recovery_under(OLD_IDENTITY_KEY)).toBe(ADDRESS);
  });

  it("waits when the stored blob cannot be loaded", async () => {
    await run_times(1);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.done_identity_steps).not.toContain("recovery_email");
    expect(record?.identity_attempts ?? 0).toBe(0);

    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    await run_times(1);

    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
    expect(count(h.puts, RESEAL_URL)).toBe(1);
  });

  it("leaves a step open when its write is refused", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    await offer_onboarding();
    h.refused_puts.add(ONBOARDING_URL);

    await run_times(1);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.done_identity_steps).toContain("recovery_email");
    expect(record?.done_identity_steps).not.toContain("onboarding");
    expect(record?.identity_attempts).toBe(1);

    h.refused_puts.clear();

    await run_times(1);

    expect(await onboarding_put()).toBe(ONBOARDING_STATE);
    expect(count(h.puts, RESEAL_URL)).toBe(1);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("leaves a step open when its list cannot be read", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    h.failing_gets.add(TAGS_URL);

    await run_times(1);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.done_identity_steps).not.toContain("tags");
    expect(record?.done_identity_steps).toContain("folders");
    expect(record?.identity_attempts).toBe(1);
  });

  it("stops retrying other steps after a bounded number of runs", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    await offer_onboarding();
    h.refused_puts.add(ONBOARDING_URL);

    await run_times(4);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.identity_attempts).toBe(4);
    expect(record?.done_identity_steps).toContain("recovery_email");

    await run_times(1);

    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("keeps the old key while the address is still sealed under it", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    await offer_onboarding();
    h.refused_puts.add(ONBOARDING_URL);
    h.reseal_mode = "accepted_not_stored";

    await run_times(5);

    const onboarding_attempts = count(h.attempted_puts, ONBOARDING_URL);

    await run_times(3);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.old_identity_key).toBe(OLD_IDENTITY_KEY);
    expect(record?.identity_attempts).toBe(5);
    expect(record?.done_identity_steps).not.toContain("recovery_email");
    expect(count(h.attempted_puts, ONBOARDING_URL)).toBe(onboarding_attempts);
    expect(count(h.attempted_puts, RESEAL_URL)).toBe(8);
    expect(await stored_recovery_under(OLD_IDENTITY_KEY)).toBe(ADDRESS);

    h.reseal_mode = "stored";

    await run_times(1);

    expect(await stored_recovery_under(NEW_IDENTITY_KEY)).toBe(ADDRESS);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("does not count a run that happens offline", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    await offer_onboarding();
    h.refused_puts.add(ONBOARDING_URL);
    set_navigator_value("onLine", false);

    await run_times(3);

    const record = await record_of(OLD_IDENTITY_KEY);

    expect(record?.identity_attempts ?? 0).toBe(0);
    expect(record?.done_identity_steps).not.toContain("onboarding");
  });

  it("carries an earlier client address without the save route", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, "user@mail_host.example.com");

    await run_times(1);

    expect(count(h.puts, RESEAL_URL)).toBe(1);
    expect(count(h.attempted_puts, RECOVERY_URL)).toBe(0);
    expect(await stored_recovery_under(NEW_IDENTITY_KEY)).toBe(
      "user@mail_host.example.com",
    );
  });

  it("leaves the record of another account untouched", async () => {
    const other_record = {
      old_identity_key: OTHER_OLD_IDENTITY_KEY,
      done_identity_steps: ["tags"],
      identity_attempts: 2,
    };

    await store_pending_reencryption(other_record);
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);

    await run_times(1);

    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
    expect(await record_of(OTHER_OLD_IDENTITY_KEY)).toEqual(other_record);

    h.gets.length = 0;

    await check_and_run_recovery_reencryption(
      {
        identity_key: "other-new-identity-key",
        previous_keys: [OTHER_OLD_IDENTITY_KEY],
      } as unknown as Vault,
      "",
    );

    expect(h.gets.length).toBeGreaterThan(0);
    expect(await record_of(OTHER_OLD_IDENTITY_KEY)).toBeNull();
  });

  it("skips a record written for a different signed in account", async () => {
    const owned_record = {
      old_identity_key: OLD_IDENTITY_KEY,
      owner_user_id: "user-b",
    };

    await store_pending_reencryption(owned_record);
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);

    await run_times(1);

    expect(h.gets).toEqual([]);
    expect(await record_of(OLD_IDENTITY_KEY)).toEqual(owned_record);

    h.user_id = "user-b";

    await run_times(1);

    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("adopts an earlier unscoped record only for the vault that holds its key", async () => {
    localStorage.clear();

    const earlier = JSON.stringify({ old_identity_key: OLD_IDENTITY_KEY });

    localStorage.setItem(PENDING_KEY, earlier);
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);

    await check_and_run_recovery_reencryption(
      { identity_key: "unrelated-identity-key" } as unknown as Vault,
      "",
    );

    expect(h.gets).toEqual([]);
    expect(localStorage.getItem(PENDING_KEY)).toBe(earlier);

    await run_times(1);

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(await stored_recovery_under(NEW_IDENTITY_KEY)).toBe(ADDRESS);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("writes nothing when the signed in account changes during a run", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);
    h.on_get = (url) => {
      if (url.startsWith("/mail/v1/tags")) h.user_id = "user-b";
    };

    await run_times(1);

    expect(h.attempted_puts).toEqual([]);
    expect(await record_of(OLD_IDENTITY_KEY)).toEqual({
      old_identity_key: OLD_IDENTITY_KEY,
    });
  });

  it("runs one pass when two callers start together", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);

    await Promise.all([run_times(1), run_times(1)]);

    expect(count(h.attempted_puts, RESEAL_URL)).toBe(1);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });

  it("stands down while another tab holds the lock for the record", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);

    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<void>,
      ) => callback(null),
    );

    set_navigator_value("locks", { request });

    await run_times(1);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain(
      await pending_storage_key(OLD_IDENTITY_KEY),
    );
    expect(request.mock.calls[0][1]).toEqual({ ifAvailable: true });
    expect(h.gets).toEqual([]);
    expect(await record_of(OLD_IDENTITY_KEY)).toEqual({
      old_identity_key: OLD_IDENTITY_KEY,
    });
  });

  it("runs under the lock when it is free", async () => {
    await offer_recovery(OLD_IDENTITY_KEY, ADDRESS);

    const request = vi.fn(
      async (
        name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<void>,
      ) => callback({ name, mode: "exclusive" }),
    );

    set_navigator_value("locks", { request });

    await run_times(1);

    expect(request).toHaveBeenCalledTimes(1);
    expect(await record_of(OLD_IDENTITY_KEY)).toBeNull();
  });
});
