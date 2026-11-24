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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  cached_user: null as { user_id: string } | null,
  csrf: "token" as string | null,
  approved: true,
  request: vi.fn(async () => null),
}));

vi.mock("./vault_decryption", () => ({
  decrypt_vault_with_lock: vi.fn(async () => null),
}));
vi.mock("@/services/api/client", () => ({
  api_client: { get_cached_user_info: () => mocks.cached_user },
}));
vi.mock("@/services/api/csrf", () => ({
  get_csrf_token_from_cookie: () => mocks.csrf,
}));
vi.mock("@/services/api/auth", () => ({
  verify_auth_status: vi.fn(async () => true),
}));
vi.mock("@/services/app_lock_store", () => ({
  get_app_lock_config: () => null,
}));
vi.mock("@/lib/session_handoff/session_handoff_client", () => ({
  await_sibling_approval: vi.fn(async () => mocks.approved),
  open_bridge_channel: vi.fn(),
  request_sibling_session: mocks.request,
}));

import {
  HANDOFF_GRANT_HASH_PREFIX,
  can_attempt_sibling_handoff,
  mint_panel_handoff_grant,
  obtain_sibling_session,
  start_sibling_sign_in,
  take_pending_handoff_grant,
} from "./sibling_session_handoff";

import {
  HANDOFF_GRANT_KEY_PREFIX,
  check_grant,
  local_grant_storage,
} from "@/lib/session_handoff/session_handoff_grant";
import {
  CALENDAR_WEB_ORIGIN,
  MAIL_WEB_ORIGIN,
} from "@/lib/session_handoff/session_handoff_protocol";

const USER_ID = "3f2a8c1e-5b4d-4e6f-9a7b-1c2d3e4f5a6b";
const GRANT = "h".repeat(43);
const PENDING_GRANT_KEY = "aster_session_handoff_grant";

function set_location(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

const original_location = window.location;
const original_open = window.open;

beforeEach(() => {
  mocks.cached_user = { user_id: USER_ID };
  mocks.csrf = "token";
  mocks.approved = true;
  mocks.request.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(window.history, "replaceState").mockImplementation(() => undefined);
  set_location(`${MAIL_WEB_ORIGIN}/`);
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: original_location,
  });
  window.open = original_open;
});

describe("take_pending_handoff_grant", () => {
  it("takes a grant from the hash and strips it from the address", () => {
    set_location(`${MAIL_WEB_ORIGIN}/mail-panel?x=1${HANDOFF_GRANT_HASH_PREFIX}${GRANT}`);

    expect(take_pending_handoff_grant()).toBe(GRANT);
    expect(window.history.replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/mail-panel?x=1",
    );
  });

  it("takes a stored grant only once", () => {
    window.sessionStorage.setItem(PENDING_GRANT_KEY, GRANT);

    expect(take_pending_handoff_grant()).toBe(GRANT);
    expect(take_pending_handoff_grant()).toBeNull();
  });

  it("ignores malformed grants and clears them", () => {
    set_location(`${MAIL_WEB_ORIGIN}/${HANDOFF_GRANT_HASH_PREFIX}short`);
    window.sessionStorage.setItem(PENDING_GRANT_KEY, "bad");

    expect(take_pending_handoff_grant()).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBeNull();
  });

  it("returns nothing when no grant is pending", () => {
    expect(take_pending_handoff_grant()).toBeNull();
  });
});

describe("mint_panel_handoff_grant", () => {
  it("writes a short approved grant for the signed-in user", () => {
    const grant = mint_panel_handoff_grant(CALENDAR_WEB_ORIGIN);

    expect(grant).not.toBeNull();
    expect(
      check_grant(local_grant_storage, grant!, CALENDAR_WEB_ORIGIN, Date.now()),
    ).toEqual({ state: "approved", user_id: USER_ID });

    const stored = JSON.parse(
      window.localStorage.getItem(HANDOFF_GRANT_KEY_PREFIX + grant)!,
    );

    expect(stored.expires_at - Date.now()).toBeLessThanOrEqual(60_000);
    expect(
      check_grant(local_grant_storage, grant!, MAIL_WEB_ORIGIN, Date.now()),
    ).toEqual({ state: "denied" });
  });

  it("writes nothing without a signed-in user", () => {
    mocks.cached_user = null;

    expect(mint_panel_handoff_grant(CALENDAR_WEB_ORIGIN)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});

describe("start_sibling_sign_in", () => {
  it("opens the approval window and keeps the grant once approved", async () => {
    const open = vi.fn(() => ({}) as Window);

    window.open = open;

    expect(await start_sibling_sign_in()).toBe("approved");

    const [url] = open.mock.calls[0] as unknown as [string];
    const grant = url.split("#approve=")[1];

    expect(url).toBe(`${CALENDAR_WEB_ORIGIN}/session_bridge.html#approve=${grant}`);
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBe(grant);
  });

  it("reports a blocked window and a refusal", async () => {
    window.open = vi.fn(() => null);
    expect(await start_sibling_sign_in()).toBe("blocked");

    window.open = vi.fn(() => ({}) as Window);
    mocks.approved = false;
    expect(await start_sibling_sign_in()).toBe("failed");
    expect(window.sessionStorage.getItem(PENDING_GRANT_KEY)).toBeNull();
  });

  it("does nothing without the shared session cookie", async () => {
    const open = vi.fn();

    window.open = open;
    mocks.csrf = null;

    expect(await start_sibling_sign_in()).toBe("failed");
    expect(open).not.toHaveBeenCalled();
  });
});

describe("obtain_sibling_session", () => {
  it("never asks the sibling without a pending grant", async () => {
    expect(await obtain_sibling_session("/")).toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("passes the pending grant to the sibling", async () => {
    window.sessionStorage.setItem(PENDING_GRANT_KEY, GRANT);

    expect(await obtain_sibling_session("/", USER_ID)).toBeNull();
    expect(mocks.request).toHaveBeenCalledWith(expect.anything(), {
      grant: GRANT,
      expected_user_id: USER_ID,
    });
  });

  it("skips pages that must not sign in", async () => {
    window.sessionStorage.setItem(PENDING_GRANT_KEY, GRANT);

    expect(await obtain_sibling_session("/register")).toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("can_attempt_sibling_handoff", () => {
  it("restores a session on the family invite page", () => {
    expect(can_attempt_sibling_handoff("/join/family")).toBe(true);
  });

  it("skips signed-out flows", () => {
    expect(can_attempt_sibling_handoff("/register")).toBe(false);
    expect(can_attempt_sibling_handoff("/family/claim/abc")).toBe(false);
    expect(can_attempt_sibling_handoff("/reset-password")).toBe(false);
  });

  it("restores a session on mailbox pages", () => {
    expect(can_attempt_sibling_handoff("/inbox")).toBe(true);
  });
});
