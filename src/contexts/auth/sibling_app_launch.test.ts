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
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";

const mocks = vi.hoisted(() => ({
  cached_user: null as { user_id: string } | null,
  locked: new Set<string>(),
  tauri: false,
}));

vi.mock("./vault_decryption", () => ({
  decrypt_vault_with_lock: vi.fn(async () => null),
}));
vi.mock("@/services/api/client", () => ({
  api_client: { get_cached_user_info: () => mocks.cached_user },
}));
vi.mock("@/services/api/csrf", () => ({
  get_csrf_token_from_cookie: () => "token",
}));
vi.mock("@/services/api/auth", () => ({
  verify_auth_status: vi.fn(async () => true),
}));
vi.mock("@/services/app_lock_store", () => ({
  get_app_lock_config: (user_id: string) =>
    mocks.locked.has(user_id) ? { enabled: true } : null,
}));
vi.mock("@/lib/tauri_runtime", () => ({
  has_tauri_runtime: () => mocks.tauri,
}));

import {
  HANDOFF_GRANT_HASH_PREFIX,
  should_attempt_boot_handoff,
  sibling_app_launch_url,
} from "./sibling_session_handoff";

import {
  request_sibling_session,
  type HandoffChannel,
} from "@/lib/session_handoff/session_handoff_client";
import {
  check_grant,
  local_grant_storage,
} from "@/lib/session_handoff/session_handoff_grant";
import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
} from "@/lib/session_handoff/session_handoff_protocol";
import {
  answer_port_message,
  to_wire,
  type BridgeDeps,
} from "@/session_bridge/session_bridge_core";

const DEFAULT_ACCOUNT_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const ACTIVE_ACCOUNT_ID = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const PASSPHRASE = "active account passphrase";

let session_key: CryptoKey;

function to_base64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
}

function set_location(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

async function remember_session(user_id: string, passphrase: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    session_key,
    new TextEncoder().encode(passphrase),
  );

  window.localStorage.setItem(
    `astermail_session_passphrase_${user_id}`,
    to_base64(new Uint8Array(cipher)),
  );
  window.localStorage.setItem(
    `astermail_session_passphrase_iv_${user_id}`,
    to_base64(iv),
  );
  window.localStorage.setItem(
    `astermail_encrypted_vault_${user_id}`,
    "QUJDREVGR0g=",
  );
  window.localStorage.setItem(`astermail_vault_nonce_${user_id}`, "bm9uY2U=");
}

function me_for(user_id: string) {
  return {
    user_id,
    username: "alex",
    email: "alex@aster.cx",
    display_name: null,
    profile_color: null,
    profile_picture: null,
  };
}

function bridge_deps(cookie_user_id: string): BridgeDeps {
  return {
    storage: local_grant_storage,
    now: () => Date.now(),
    sleep: async () => undefined,
    load_session_key: async () => session_key,
    fetch_current_user: async () => me_for(cookie_user_id),
    decrypt: (key, ciphertext, iv) =>
      crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        ciphertext as BufferSource,
      ),
  };
}

function bridge_channel(audience: string, deps: BridgeDeps): HandoffChannel {
  const replies: Promise<unknown>[] = [];

  return {
    send(message) {
      replies.push(
        answer_port_message(deps, audience, message).then((reply) =>
          reply ? to_wire(reply) : null,
        ),
      );
    },
    next: async () => (await replies.shift()) ?? null,
    close: () => undefined,
  };
}

function grant_from(url: string): string {
  const hash = new URL(url).hash;

  expect(hash.startsWith(HANDOFF_GRANT_HASH_PREFIX)).toBe(true);

  return hash.slice(HANDOFF_GRANT_HASH_PREFIX.length);
}

const original_location = window.location;

beforeAll(async () => {
  session_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
});

beforeEach(() => {
  mocks.cached_user = { user_id: ACTIVE_ACCOUNT_ID };
  mocks.locked.clear();
  mocks.tauri = false;
  window.localStorage.clear();
  window.sessionStorage.clear();
  set_location(`${MAIL_WEB_ORIGIN}/u/1/inbox`);
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: original_location,
  });
});

describe("sibling_app_launch_url", () => {
  it("carries a grant for the active account, not the default one", () => {
    const url = sibling_app_launch_url(CALENDAR_WEB_ORIGIN);
    const grant = grant_from(url);

    expect(url.startsWith(`${CALENDAR_WEB_ORIGIN}/`)).toBe(true);
    expect(
      check_grant(local_grant_storage, grant, CALENDAR_WEB_ORIGIN, Date.now()),
    ).toEqual({ state: "approved", user_id: ACTIVE_ACCOUNT_ID });
  });

  it("mints a new grant on every launch", () => {
    const first = grant_from(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));
    const second = grant_from(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));

    expect(first).not.toBe(second);
  });

  it("follows an account switch made in the source app", () => {
    const before = grant_from(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));

    mocks.cached_user = { user_id: DEFAULT_ACCOUNT_ID };

    const after = grant_from(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));

    expect(
      check_grant(local_grant_storage, before, CALENDAR_WEB_ORIGIN, Date.now()),
    ).toEqual({ state: "approved", user_id: ACTIVE_ACCOUNT_ID });
    expect(
      check_grant(local_grant_storage, after, CALENDAR_WEB_ORIGIN, Date.now()),
    ).toEqual({ state: "approved", user_id: DEFAULT_ACCOUNT_ID });
  });

  it("works from Calendar to Mail too", () => {
    set_location(`${CALENDAR_WEB_ORIGIN}/`);

    const grant = grant_from(sibling_app_launch_url(MAIL_WEB_ORIGIN));

    expect(
      check_grant(local_grant_storage, grant, MAIL_WEB_ORIGIN, Date.now()),
    ).toEqual({ state: "approved", user_id: ACTIVE_ACCOUNT_ID });
  });

  it("leaves the link alone when no handoff is allowed", () => {
    const plain = (target: string) =>
      expect(sibling_app_launch_url(target)).toBe(target);

    plain("https://calendar.astermail.org.evil.example/");
    plain(`${MAIL_WEB_ORIGIN}/`);
    plain("not a url");

    mocks.locked.add(ACTIVE_ACCOUNT_ID);
    plain(CALENDAR_WEB_ORIGIN);
    mocks.locked.clear();

    window.localStorage.setItem(
      `astermail_shared_grant_epoch_${ACTIVE_ACCOUNT_ID}`,
      "1",
    );
    plain(CALENDAR_WEB_ORIGIN);
    window.localStorage.clear();

    mocks.tauri = true;
    plain(CALENDAR_WEB_ORIGIN);
    mocks.tauri = false;

    mocks.cached_user = null;
    plain(CALENDAR_WEB_ORIGIN);

    mocks.cached_user = { user_id: ACTIVE_ACCOUNT_ID };
    set_location("https://evil.example/");
    plain(CALENDAR_WEB_ORIGIN);

    expect(window.localStorage.length).toBe(0);
  });
});

describe("should_attempt_boot_handoff", () => {
  it("tries a handoff on a fresh device", () => {
    expect(should_attempt_boot_handoff(false)).toBe(true);
  });

  it("does not ask the sibling app without a grant once signed in", () => {
    set_location(`${CALENDAR_WEB_ORIGIN}/`);

    expect(should_attempt_boot_handoff(true)).toBe(false);
  });

  it("follows a launch grant even when another account is stored", () => {
    set_location(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));

    expect(should_attempt_boot_handoff(true)).toBe(true);
  });

  it("follows an approved grant waiting in this tab", () => {
    set_location(`${CALENDAR_WEB_ORIGIN}/`);
    window.sessionStorage.setItem("aster_session_handoff_grant", "k".repeat(43));

    expect(should_attempt_boot_handoff(true)).toBe(true);
  });

  it("ignores a malformed grant", () => {
    set_location(`${CALENDAR_WEB_ORIGIN}/${HANDOFF_GRANT_HASH_PREFIX}short`);

    expect(should_attempt_boot_handoff(true)).toBe(false);
  });
});

describe("launch handoff end to end", () => {
  async function open_calendar_from_mail(
    cookie_user_id: string,
    bridge_audience: string = CALENDAR_WEB_ORIGIN,
  ) {
    await remember_session(ACTIVE_ACCOUNT_ID, PASSPHRASE);
    await remember_session(DEFAULT_ACCOUNT_ID, "default passphrase");

    const grant = grant_from(sibling_app_launch_url(CALENDAR_WEB_ORIGIN));
    const deps = bridge_deps(cookie_user_id);

    return (expected_user_id?: string) =>
      request_sibling_session(
        {
          origin: CALENDAR_WEB_ORIGIN,
          has_session_cookie: () => true,
          verify_server_session: async () => cookie_user_id,
          has_local_lock: () => false,
          open_channel: async () => bridge_channel(bridge_audience, deps),
        },
        { grant, expected_user_id },
      );
  }

  it("opens the account that is active in Mail", async () => {
    const request = await open_calendar_from_mail(ACTIVE_ACCOUNT_ID);
    const session = await request();

    expect(session?.user.id).toBe(ACTIVE_ACCOUNT_ID);
    expect(session?.passphrase).toBe(PASSPHRASE);
  });

  it("uses each grant once", async () => {
    const request = await open_calendar_from_mail(ACTIVE_ACCOUNT_ID);

    expect(await request()).not.toBeNull();
    expect(await request()).toBeNull();
  });

  it("hands nothing over when the server session belongs to someone else", async () => {
    const request = await open_calendar_from_mail(DEFAULT_ACCOUNT_ID);

    expect(await request()).toBeNull();
  });

  it("hands nothing over when Calendar expects a different account", async () => {
    const request = await open_calendar_from_mail(ACTIVE_ACCOUNT_ID);

    expect(await request(DEFAULT_ACCOUNT_ID)).toBeNull();
  });

  it("refuses a grant presented by another origin", async () => {
    const request = await open_calendar_from_mail(
      ACTIVE_ACCOUNT_ID,
      "https://evil.example",
    );

    expect(await request()).toBeNull();
  });
});
