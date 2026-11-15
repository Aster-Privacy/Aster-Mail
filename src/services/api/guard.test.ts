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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  api_client: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    set_csrf: vi.fn(),
    set_dev_token: vi.fn(),
    set_authenticated: vi.fn(),
  },
}));

const { api_client } = await import("./client");
const guard = await import("./guard");

const TOKEN = "gt_fake";
const ACTION = { nonce: "n", signature: "s", proof: null };
const DEVICE = {
  ed25519_pk: "a",
  mlkem_pk: "b",
  x25519_pk: "c",
  action_pk: "d",
  device_type: "web" as const,
  name: "Firefox on Windows",
};

type Mocked = ReturnType<typeof vi.fn>;

function last(method: "get" | "post" | "put"): unknown[] {
  const fn = api_client[method] as unknown as Mocked;

  return fn.mock.calls[fn.mock.calls.length - 1];
}

function token_header(config: unknown): string | undefined {
  const headers = (config as { headers?: Record<string, string> })?.headers;

  return headers?.["X-Aster-Guard-Token"];
}

describe("guard sign-in complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the session like a normal sign-in", async () => {
    (api_client.post as unknown as Mocked).mockResolvedValueOnce({
      data: {
        user_id: "u1",
        csrf_token: "csrf_fake",
        access_token: "at_fake",
        refresh_token: "rt_fake",
        guard: { device_id: "d1", code_secret_sealed: "x", approval_envelope: null },
      },
    });
    await guard.guard_sign_in_complete(TOKEN);
    expect(api_client.set_csrf).toHaveBeenCalledWith("csrf_fake");
    expect(api_client.set_dev_token).toHaveBeenCalledWith("at_fake", "rt_fake");
    expect(api_client.set_authenticated).toHaveBeenCalledWith(true);
  });

  it("leaves the session alone when the request fails", async () => {
    (api_client.post as unknown as Mocked).mockResolvedValueOnce({
      data: undefined,
      error: "gone",
      status: 410,
    });
    await guard.guard_sign_in_complete(TOKEN);
    expect(api_client.set_authenticated).not.toHaveBeenCalled();
  });
});

describe("guard api routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["guard_challenge", () => guard.guard_challenge(), "/core/v1/guard/challenge"],
    ["guard_setup_nonce", () => guard.guard_setup_nonce(), "/core/v1/guard/setup/nonce"],
    [
      "guard_step_up_passkey_options",
      () => guard.guard_step_up_passkey_options(),
      "/core/v1/guard/step-up/passkey/options",
    ],
    [
      "guard_join_complete",
      () => guard.guard_join_complete({ request_id: "r1" }),
      "/core/v1/guard/join/complete",
    ],
  ])("%s posts to its route", async (_name, call, path) => {
    await call();
    expect(last("post")[0]).toBe(path);
  });

  it.each([
    ["get_guard_status", () => guard.get_guard_status(), "/core/v1/guard"],
    ["list_guard_requests", () => guard.list_guard_requests(), "/core/v1/guard/requests"],
    ["list_guard_changes", () => guard.list_guard_changes(), "/core/v1/guard/changes"],
    [
      "get_guard_join_status",
      () => guard.get_guard_join_status("r1"),
      "/core/v1/guard/join/r1",
    ],
    [
      "get_guard_change_result",
      () => guard.get_guard_change_result("c1"),
      "/core/v1/guard/changes/c1/result",
    ],
    [
      "guard_rescue_status",
      () => guard.guard_rescue_status("x1"),
      "/core/v1/guard/sign-in/rescue/status?id=x1",
    ],
  ])("%s gets its route", async (_name, call, path) => {
    await call();
    expect(last("get")[0]).toBe(path);
  });

  it("guard_rescue_status sends no guard token", async () => {
    await guard.guard_rescue_status("x1");
    expect(token_header(last("get")[1])).toBeUndefined();
  });

  it("guard_setup posts the body", async () => {
    const body = {
      device: DEVICE,
      nonce: "n",
      possession_signature: "p",
      rescue_code: "BCDFGHJKMN23456789BCDFGHJ",
      switches: 1,
      hold_scopes: 0,
      proof: { type: "password" as const, password_hash: "h", totp_code: null },
    };

    await guard.guard_setup(body);
    expect(last("post")).toEqual(["/core/v1/guard/setup", body]);
  });

  it("put_guard_switches uses PUT", async () => {
    const body = { switches: 9, hold_scopes: 5, action: ACTION };

    await guard.put_guard_switches(body);
    expect(last("put")).toEqual(["/core/v1/guard/switches", body]);
  });

  it.each([
    [
      "guard_sign_in_begin",
      () =>
        guard.guard_sign_in_begin(TOKEN, {
          device: DEVICE,
          envelope_versions: guard.GUARD_ENVELOPE_VERSIONS,
          number_hash: "h",
          resume: null,
        }),
      "/core/v1/guard/sign-in/begin",
    ],
    [
      "guard_sign_in_resume_nonce",
      () => guard.guard_sign_in_resume_nonce(TOKEN, { device_id: "d1" }),
      "/core/v1/guard/sign-in/resume-nonce",
    ],
    [
      "guard_sign_in_code",
      () => guard.guard_sign_in_code(TOKEN, "GG5F5"),
      "/core/v1/guard/sign-in/code",
    ],
    [
      "guard_sign_in_complete",
      () => guard.guard_sign_in_complete(TOKEN),
      "/core/v1/guard/sign-in/complete",
    ],
    [
      "guard_sign_in_rescue",
      () => guard.guard_sign_in_rescue(TOKEN, "BCDFGHJKMN23456789BCDFGHJ"),
      "/core/v1/guard/sign-in/rescue",
    ],
  ])("%s posts with the guard token", async (_name, call, path) => {
    await call();
    const [endpoint, , config] = last("post");

    expect(endpoint).toBe(path);
    expect(token_header(config)).toBe(TOKEN);
    expect((config as { skip_session_refresh?: boolean }).skip_session_refresh).toBe(
      true,
    );
  });

  it("guard_sign_in_status gets with the guard token", async () => {
    await guard.guard_sign_in_status(TOKEN);
    const [endpoint, config] = last("get");

    expect(endpoint).toBe("/core/v1/guard/sign-in/status");
    expect(token_header(config)).toBe(TOKEN);
  });

  it("approve and deny post to the request routes", async () => {
    await guard.approve_guard_request("r1", {
      number: 42,
      approval_envelope: "e",
      action: ACTION,
    });
    expect(last("post")).toEqual([
      "/core/v1/guard/requests/r1/approve",
      { number: 42, approval_envelope: "e", action: ACTION },
    ]);

    await guard.deny_guard_request("r1", ACTION);
    expect(last("post")).toEqual([
      "/core/v1/guard/requests/r1/deny",
      { action: ACTION },
    ]);
  });

  it("join posts the device keys", async () => {
    const body = {
      request_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      device: DEVICE,
      envelope_versions: [2],
      number_hash: "h",
      action: ACTION,
    };

    await guard.guard_join(body);
    expect(last("post")).toEqual(["/core/v1/guard/join", body]);
  });

  it("cancel, remove and panic post a signed action", async () => {
    await guard.cancel_guard_change("c1", ACTION);
    expect(last("post")).toEqual([
      "/core/v1/guard/changes/c1/cancel",
      { action: ACTION },
    ]);

    await guard.remove_guard_device("d1", ACTION);
    expect(last("post")).toEqual([
      "/core/v1/guard/devices/d1/remove",
      { action: ACTION },
    ]);

    await guard.guard_panic(ACTION);
    expect(last("post")).toEqual(["/core/v1/guard/panic", { action: ACTION }]);
  });

  it("skip carries the step-up proof inside the action", async () => {
    const proof = {
      type: "password" as const,
      password_hash: "h",
      totp_code: null,
    };

    await guard.skip_guard_change("c1", ACTION, proof);
    expect(last("post")).toEqual([
      "/core/v1/guard/changes/c1/skip",
      { action: { ...ACTION, proof } },
    ]);

    await guard.skip_guard_change("c1", ACTION, null);
    expect(last("post")[1]).toEqual({ action: ACTION });
  });

  it("veto by link skips the session refresh", async () => {
    await guard.guard_veto({ id: "c1", t: "vt" });
    expect(last("post")).toEqual([
      "/core/v1/guard/veto",
      { id: "c1", t: "vt" },
      { skip_session_refresh: true },
    ]);

    await guard.guard_veto({ id: "c1", action: ACTION });
    expect(last("post")).toEqual([
      "/core/v1/guard/veto",
      { id: "c1", action: ACTION },
      { skip_session_refresh: false },
    ]);
  });

  it("encodes ids in paths", async () => {
    await guard.deny_guard_request("a/b", ACTION);
    expect(last("post")[0]).toBe("/core/v1/guard/requests/a%2Fb/deny");
  });

  it("exposes the switch and scope bits", () => {
    expect(guard.GUARD_SWITCH).toEqual({
      new_device_approval: 1,
      hold_changes: 2,
      approve_mail_apps: 4,
      recovery_wait: 8,
    });
    expect(guard.GUARD_SCOPE).toEqual({
      forwarding_rules: 1,
      recovery_password: 2,
      security_export: 4,
    });
    expect(guard.GUARD_ENVELOPE_VERSIONS).toEqual([2]);
  });
});
