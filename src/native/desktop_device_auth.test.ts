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

const invoke_mock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invoke_mock(cmd, args),
}));

const post_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: (path: string, body: unknown) => post_mock(path, body),
    set_dev_token: vi.fn(),
    set_csrf: vi.fn(),
    set_authenticated: vi.fn(),
  },
}));

const device_state = {
  device_id: null as string | null,
  identity: "identity-a",
};

function install_tauri(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

beforeEach(() => {
  vi.resetModules();
  invoke_mock.mockReset();
  post_mock.mockReset();
  device_state.device_id = "device-1";
  device_state.identity = "identity-a";
  install_tauri();

  invoke_mock.mockImplementation(
    (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "device_get_pubkeys") {
        return Promise.resolve({
          device_id: device_state.device_id,
          ed25519_pk: device_state.identity,
          mlkem_pk: "mlkem",
          x25519_pk: "x25519",
          machine_name: "machine",
        });
      }
      if (cmd === "device_clear_session") {
        device_state.device_id = null;

        return Promise.resolve();
      }
      if (cmd === "device_clear_identity") {
        device_state.device_id = null;
        device_state.identity = "identity-b";

        return Promise.resolve();
      }
      if (cmd === "device_forget_account") {
        if (device_state.device_id === (args?.deviceId as string)) {
          device_state.device_id = null;
        }

        return Promise.resolve();
      }
      if (cmd === "device_set_id") {
        device_state.device_id = args?.deviceId as string;

        return Promise.resolve();
      }
      if (cmd === "device_unseal_vault_envelope") {
        if (args?.envelopeB64 === "broken") {
          return Promise.reject(new Error("bad envelope"));
        }

        return Promise.resolve("cGFzcw");
      }
      if (cmd === "device_sign_challenge") return Promise.resolve("signature");
      if (cmd === "device_get_stored_passphrase") {
        return Promise.resolve("cGFzcw");
      }

      return Promise.resolve(null);
    },
  );

  post_mock.mockImplementation((path: string) => {
    if (path === "/core/v1/auth/device/challenge") {
      return Promise.resolve({
        data: { challenge_id: "challenge-1", nonce: "nonce" },
        error: null,
      });
    }
    if (path === "/core/v1/auth/device/login") {
      return Promise.resolve({
        data: { access_token: "token", csrf_token: "csrf" },
        error: null,
      });
    }

    return Promise.resolve({ data: null, error: "unexpected" });
  });
});

describe("desktop device session lifecycle", () => {
  it("signs in silently while a device session is stored", async () => {
    const module = await import("./desktop_device_auth");
    const events: string[] = [];
    const listener = () => events.push("success");

    window.addEventListener("astermail:device-login-success", listener);
    await module.init_desktop_device_auth();
    window.removeEventListener("astermail:device-login-success", listener);

    expect(events).toEqual(["success"]);
  });

  it("does not sign back in after the device session is cleared", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.clear_device_session();

    const events: string[] = [];
    const success = () => events.push("success");
    const pairing = () => events.push("pairing");

    window.addEventListener("astermail:device-login-success", success);
    window.addEventListener("astermail:device-needs-pairing", pairing);
    await module.init_desktop_device_auth();
    window.removeEventListener("astermail:device-login-success", success);
    window.removeEventListener("astermail:device-needs-pairing", pairing);

    expect(events).toEqual(["pairing"]);
  });

  it("drops the stored passphrase when the session is cleared", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.clear_device_session();

    expect(module.consume_pending_device_login()).toBeNull();
  });

  it("signs in with the account's own device id when one is stored", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth("device-account-b");

    expect(post_mock).toHaveBeenCalledWith("/core/v1/auth/device/challenge", {
      device_id: "device-account-b",
    });
    expect(invoke_mock).toHaveBeenCalledWith("device_get_stored_passphrase", {
      deviceId: "device-account-b",
    });
    expect(module.consume_pending_device_login()?.device_id).toBe(
      "device-account-b",
    );
  });

  it("completes pairing without broadcasting a sign-in event", async () => {
    const module = await import("./desktop_device_auth");
    const events: string[] = [];
    const listener = () => events.push("success");

    window.addEventListener("astermail:device-login-success", listener);
    const result = await module.complete_device_pairing("device-2", "sealed");

    window.removeEventListener("astermail:device-login-success", listener);

    expect(events).toEqual([]);
    expect(result.error).toBeNull();
    expect(result.device_id).toBe("device-2");
    expect(result.passphrase).toBe("pass");
    expect(invoke_mock).toHaveBeenCalledWith("device_unseal_vault_envelope", {
      envelopeB64: "sealed",
      deviceId: "device-2",
    });
    expect(module.consume_pending_device_login()).toBeNull();
  });

  it("forgets only the failed account when pairing breaks", async () => {
    const module = await import("./desktop_device_auth");

    const result = await module.complete_device_pairing("device-2", "broken");

    expect(result.error).toBe("bad envelope");
    expect(invoke_mock).toHaveBeenCalledWith("device_forget_account", {
      deviceId: "device-2",
    });
    expect(invoke_mock).not.toHaveBeenCalledWith(
      "device_clear_session",
      undefined,
    );
  });

  it("forgets one account and lets the device pair again", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.forget_device_account("device-1");

    expect(invoke_mock).toHaveBeenCalledWith("device_forget_account", {
      deviceId: "device-1",
    });

    const events: string[] = [];
    const pairing = () => events.push("pairing");

    window.addEventListener("astermail:device-needs-pairing", pairing);
    await module.init_desktop_device_auth();
    window.removeEventListener("astermail:device-needs-pairing", pairing);

    expect(events).toEqual(["pairing"]);
  });

  it("rotates the device identity when the identity is cleared", async () => {
    const module = await import("./desktop_device_auth");

    await module.init_desktop_device_auth();
    await module.clear_device_identity();

    const events: string[] = [];

    window.addEventListener("astermail:device-needs-pairing", ((
      event: Event,
    ) => {
      const detail = (event as CustomEvent<{ pubkeys: { ed25519_pk: string } }>)
        .detail;

      events.push(detail.pubkeys.ed25519_pk);
    }) as EventListener);
    await module.init_desktop_device_auth();

    expect(events).toEqual(["identity-b"]);
    expect(invoke_mock).toHaveBeenCalledWith(
      "device_clear_identity",
      undefined,
    );
  });
});

function fail_login_with(status: number | null): void {
  post_mock.mockImplementation((path: string) => {
    if (path === "/core/v1/auth/device/challenge") {
      return Promise.resolve({
        data: { challenge_id: "challenge-1", nonce: "nonce" },
        error: null,
      });
    }
    if (path === "/core/v1/auth/device/login") {
      if (status === null) {
        return Promise.reject(new Error("network down"));
      }

      return Promise.resolve({ data: null, error: "failed", status });
    }

    return Promise.resolve({ data: null, error: "unexpected" });
  });
}

describe("device relogin decisions", () => {
  it("reports a signed in outcome when the device login succeeds", async () => {
    const module = await import("./desktop_device_auth");

    await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
      "signed_in",
    );
  });

  it("treats a 401 from the device login as a rejected pairing", async () => {
    fail_login_with(401);
    const module = await import("./desktop_device_auth");

    await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
      "rejected",
    );
  });

  it("treats a missing stored passphrase as a rejected pairing", async () => {
    const base = invoke_mock.getMockImplementation();

    invoke_mock.mockImplementation(
      (cmd: string, args?: Record<string, unknown>) => {
        if (cmd === "device_get_stored_passphrase") {
          return Promise.resolve(null);
        }

        return base?.(cmd, args);
      },
    );
    const module = await import("./desktop_device_auth");

    await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
      "rejected",
    );
  });

  it.each([429, 500, 502, 503, 403])(
    "keeps the pairing when the device login returns %i",
    async (status) => {
      fail_login_with(status);
      const module = await import("./desktop_device_auth");

      await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
        "unavailable",
      );
    },
  );

  it("keeps the pairing when the network fails", async () => {
    fail_login_with(null);
    const module = await import("./desktop_device_auth");

    await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
      "unavailable",
    );
  });

  it("keeps the pairing when the challenge request fails", async () => {
    post_mock.mockImplementation(() =>
      Promise.resolve({ data: null, error: "busy", status: 503 }),
    );
    const module = await import("./desktop_device_auth");

    await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
      "unavailable",
    );
  });

  it("forgets only after repeated rejections", async () => {
    fail_login_with(401);
    const module = await import("./desktop_device_auth");
    const wait = vi.fn(() => Promise.resolve());

    await expect(
      module.relogin_with_retries("device-1", () => false, wait),
    ).resolves.toBe("rejected");
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("never forgets when every attempt fails transiently", async () => {
    fail_login_with(429);
    const module = await import("./desktop_device_auth");
    const wait = vi.fn(() => Promise.resolve());

    await expect(
      module.relogin_with_retries("device-1", () => false, wait),
    ).resolves.toBe("unavailable");
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("does not forget when a rejection is followed by a transient error", async () => {
    let calls = 0;

    post_mock.mockImplementation((path: string) => {
      if (path === "/core/v1/auth/device/challenge") {
        return Promise.resolve({
          data: { challenge_id: "challenge-1", nonce: "nonce" },
          error: null,
        });
      }
      calls += 1;
      const status = calls % 2 === 1 ? 401 : 503;

      return Promise.resolve({ data: null, error: "failed", status });
    });
    const module = await import("./desktop_device_auth");

    await expect(
      module.relogin_with_retries(
        "device-1",
        () => false,
        () => Promise.resolve(),
      ),
    ).resolves.toBe("unavailable");
  });

  it("recovers when a later attempt succeeds", async () => {
    let calls = 0;

    post_mock.mockImplementation((path: string) => {
      if (path === "/core/v1/auth/device/challenge") {
        return Promise.resolve({
          data: { challenge_id: "challenge-1", nonce: "nonce" },
          error: null,
        });
      }
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({ data: null, error: "busy", status: 429 });
      }

      return Promise.resolve({
        data: { access_token: "token", csrf_token: "csrf" },
        error: null,
      });
    });
    const module = await import("./desktop_device_auth");

    await expect(
      module.relogin_with_retries(
        "device-1",
        () => false,
        () => Promise.resolve(),
      ),
    ).resolves.toBe("signed_in");
  });

  it("stops retrying once cancelled", async () => {
    fail_login_with(503);
    const module = await import("./desktop_device_auth");

    await expect(
      module.relogin_with_retries(
        "device-1",
        () => true,
        () => Promise.resolve(),
      ),
    ).resolves.toBe("unavailable");
    expect(post_mock).not.toHaveBeenCalled();
  });
});

describe("explicit sign out flag", () => {
  it("is consumed once after a sign out", async () => {
    const module = await import("./desktop_device_auth");

    module.mark_explicit_sign_out();
    expect(module.take_explicit_sign_out()).toBe(true);
    expect(module.take_explicit_sign_out()).toBe(false);
  });

  it("is cleared when the user signs in again", async () => {
    const module = await import("./desktop_device_auth");

    module.mark_explicit_sign_out();
    module.clear_explicit_sign_out();
    expect(module.take_explicit_sign_out()).toBe(false);
  });

  it("is never set outside the desktop app", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const module = await import("./desktop_device_auth");

    module.mark_explicit_sign_out();
    expect(module.take_explicit_sign_out()).toBe(false);
  });
});

describe("session expiry keeps the device paired", () => {
  it("keeps the pairing for a few expiries and then stops", async () => {
    const module = await import("./desktop_device_auth");
    const start = 1_000_000;

    expect(module.keep_pairing_after_session_expiry(start)).toBe(true);
    expect(module.keep_pairing_after_session_expiry(start + 1_000)).toBe(true);
    expect(module.keep_pairing_after_session_expiry(start + 2_000)).toBe(true);
    expect(module.keep_pairing_after_session_expiry(start + 3_000)).toBe(false);
  });

  it("allows another relogin once the window has passed", async () => {
    const module = await import("./desktop_device_auth");
    const start = 1_000_000;

    for (let i = 0; i < 3; i++) {
      module.keep_pairing_after_session_expiry(start + i);
    }

    expect(module.keep_pairing_after_session_expiry(start + 10 * 60_000)).toBe(
      true,
    );
  });

  it("never keeps a pairing outside the desktop app", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    const module = await import("./desktop_device_auth");

    expect(module.keep_pairing_after_session_expiry()).toBe(false);
  });

  it("leaves the device session alone when the pairing is kept", async () => {
    const module = await import("./desktop_device_auth");

    await module.release_device_after_sign_out({
      keep_pairing: true,
      keep_other_accounts: false,
      device_id: "device-1",
    });

    expect(invoke_mock.mock.calls.map((call) => call[0])).not.toContain(
      "device_clear_session",
    );
    expect(device_state.device_id).toBe("device-1");
    await expect(module.attempt_device_relogin("device-1")).resolves.toBe(
      "signed_in",
    );
  });

  it("forgets only the current account when others stay signed in", async () => {
    const module = await import("./desktop_device_auth");

    await module.release_device_after_sign_out({
      keep_pairing: false,
      keep_other_accounts: true,
      device_id: "device-1",
    });

    expect(invoke_mock).toHaveBeenCalledWith("device_forget_account", {
      deviceId: "device-1",
    });
    expect(invoke_mock.mock.calls.map((call) => call[0])).not.toContain(
      "device_clear_session",
    );
  });

  it("clears the device session when the pairing is not kept", async () => {
    const module = await import("./desktop_device_auth");

    await module.release_device_after_sign_out({
      keep_pairing: false,
      keep_other_accounts: false,
      device_id: "device-1",
    });

    expect(device_state.device_id).toBeNull();
  });
});
