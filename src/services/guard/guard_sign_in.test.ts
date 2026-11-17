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
import type { GuardDevice } from "@/services/guard/guard_device";
import type {
  GuardSignInDeps,
  GuardSignInStart,
  GuardSignInState,
} from "@/services/guard/guard_sign_in";
import type { MockedObject } from "vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { base64url_encode } from "@/lib/crypto/device_envelope";
import { number_hash } from "@/lib/crypto/guard_action";
import { set_server_time_offset_for_tests } from "@/lib/server_clock";
import * as api from "@/services/api/guard";
import {
  GUARD_POLL_INTERVAL_MS,
  GUARD_SIGN_IN_STORAGE_KEY,
  default_guard_sign_in_deps,
  GuardSignInController,
  normalize_guard_code,
  read_stored_guard_sign_in,
} from "@/services/guard/guard_sign_in";

vi.mock("@/services/guard/guard_device", () => ({
  create_guard_device: vi.fn(),
  get_guard_device: vi.fn(),
  read_guard_hint: vi.fn(),
  rekey_guard_device: vi.fn(),
  write_guard_hint: vi.fn(),
}));

vi.mock("@/services/api/guard", () => ({
  GUARD_ENVELOPE_VERSIONS: [2],
  guard_sign_in_begin: vi.fn(),
  guard_sign_in_code: vi.fn(),
  guard_sign_in_complete: vi.fn(),
  guard_sign_in_rescue: vi.fn(),
  guard_sign_in_resume_nonce: vi.fn(),
  guard_sign_in_status: vi.fn(),
}));

type Mocked = ReturnType<typeof vi.fn>;

const REQUEST_ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = "gt_fake";
const NOW = Date.parse("2026-11-15T10:00:00Z");
const EXPIRES = "2026-11-15T10:05:00Z";
const USER_ID = "22222222-3333-4444-8555-666666666666";
const USER_HASH = "uh_fake";
const RESCUE = "23456-789BC-DFGHJ-KMNPQ-RTVWX";

function mock(fn: unknown): Mocked {
  return fn as Mocked;
}

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

type FakeDevice = MockedObject<GuardDevice>;

function fake_device(device_id: string | null = null): FakeDevice {
  return {
    public_keys: vi.fn(async () => ({
      ed25519_pk: new Uint8Array(32).fill(1),
      mlkem_pk: new Uint8Array(1184).fill(2),
      x25519_pk: new Uint8Array(32).fill(3),
      action_pk: new Uint8Array(33).fill(4),
      device_type: "web" as const,
      name: "Firefox · Windows",
    })),
    device_id: vi.fn(async () => device_id),
    set_device_id: vi.fn(async () => undefined),
    sign: vi.fn(async () => new Uint8Array(64).fill(9)),
    open_seal: vi.fn(async () => new Uint8Array(32).fill(5)),
    open_envelope: vi.fn(async () => new TextEncoder().encode("pass phrase")),
    store_code_secret: vi.fn(async () => undefined),
    code_secret: vi.fn(async () => null),
    forget: vi.fn(async () => undefined),
  } as unknown as FakeDevice;
}

let storage: MemoryStorage;
let devices: Map<string, FakeDevice>;
let hints: Map<string, string>;
let deps: GuardSignInDeps;
let states: GuardSignInState[];

function make_deps(): GuardSignInDeps {
  return {
    get_device: vi.fn(async (key: string) => devices.get(key) ?? null),
    create_device: vi.fn(async (key: string) => {
      const d = fake_device();

      devices.set(key, d);

      return d;
    }),
    rekey_device: vi.fn(async (from: string, to: string) => {
      const d = devices.get(from);

      if (d) {
        devices.delete(from);
        devices.set(to, d);
      }
    }),
    read_hint: vi.fn(async (h: string) => hints.get(h) ?? null),
    write_hint: vi.fn(async (h: string, id: string) => {
      hints.set(h, id);
    }),
    device_name: () => "Firefox · Windows",
    storage: () => storage as unknown as Storage,
    now: () => Date.now(),
  };
}

function fresh(
  user_hash: string | null = null,
  user_id: string | null = null,
) {
  return {
    kind: "fresh" as const,
    info: {
      request_id: REQUEST_ID,
      guard_token: TOKEN,
      expires_at: EXPIRES,
      user_id,
      methods: ["approve" as const, "code" as const, "rescue" as const],
    },
    user_hash,
  };
}

function make(
  start: GuardSignInStart = fresh(),
  finish = vi.fn(async () => undefined),
) {
  const controller = new GuardSignInController(start, finish, deps);

  controller.subscribe((s) => states.push(s));

  return { controller, finish };
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

function complete_body(envelope: string | null) {
  return {
    data: {
      user_id: USER_ID,
      username: "fake",
      email: "fake@astermail.org",
      csrf_token: "c",
      encrypted_vault: "v",
      vault_nonce: "n",
      guard: {
        device_id: "33333333-4444-4555-8666-777777777777",
        code_secret_sealed: base64url_encode(new Uint8Array(80)),
        approval_envelope: envelope,
      },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  storage = new MemoryStorage();
  devices = new Map();
  hints = new Map();
  deps = make_deps();
  states = [];
  mock(api.guard_sign_in_begin).mockResolvedValue({
    data: { status: "pending", expires_at: EXPIRES },
  });
  mock(api.guard_sign_in_status).mockResolvedValue({
    data: { status: "pending", expires_at: EXPIRES, apply_after: null },
  });
});

afterEach(() => {
  set_server_time_offset_for_tests(null);
  vi.useRealTimers();
});

describe("GuardSignInController begin", () => {
  it("sends the device keys, envelope versions and number hash", async () => {
    const { controller } = make();

    controller.start();
    await flush();

    const [token, body] = mock(api.guard_sign_in_begin).mock.calls[0];
    const number = controller.get_state().number as number;

    expect(token).toBe(TOKEN);
    expect(Object.keys(body).sort()).toEqual(
      ["device", "envelope_versions", "number_hash", "resume"].sort(),
    );
    expect(body.envelope_versions).toEqual([2]);
    expect(body.resume).toBeNull();
    expect(body.device.device_type).toBe("web");
    expect(body.device.name).toBe("Firefox · Windows");
    expect(body.number_hash).toBe(
      base64url_encode(number_hash(REQUEST_ID, number)),
    );
    expect(number).toBeGreaterThanOrEqual(10);
    expect(number).toBeLessThanOrEqual(99);
    expect(deps.create_device).toHaveBeenCalledWith(
      `pending:${REQUEST_ID}`,
      "Firefox · Windows",
    );
    expect(controller.get_state().phase).toBe("waiting");
    controller.stop();
  });

  it("polls the status every second", async () => {
    const { controller } = make();

    controller.start();
    await flush();
    expect(api.guard_sign_in_status).not.toHaveBeenCalled();
    await tick(GUARD_POLL_INTERVAL_MS);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(1);
    await tick(GUARD_POLL_INTERVAL_MS);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it("waits retry_after_secs after a 429", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      error: "slow down",
      status: 429,
      server_code: "GUARD_TOO_MANY_REQUESTS",
      retry_after_secs: 5,
    });
    const { controller } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(1);
    await tick(4000);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(1);
    await tick(1000);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it("shows the paused state while the server pauses the request", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      error: "paused",
      status: 429,
      server_code: "GUARD_PAUSED",
      retry_after_secs: 30,
    });
    const { controller } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(controller.get_state().phase).toBe("paused");
    await tick(30_000);
    expect(controller.get_state().phase).toBe("waiting");
    controller.stop();
  });

  it("ends as denied and forgets the pending device", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "denied", expires_at: EXPIRES, apply_after: null },
    });
    const { controller } = make();

    controller.start();
    await flush();
    const pending = devices.get(`pending:${REQUEST_ID}`) as FakeDevice;

    await tick(1000);
    expect(controller.get_state().phase).toBe("denied");
    expect(pending.forget).toHaveBeenCalled();
    expect(storage.getItem(GUARD_SIGN_IN_STORAGE_KEY)).toBeNull();
    await tick(5000);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(1);
  });

  it("forgets the pending device when a rescue takes over the request", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: {
        status: "rescue_pending",
        expires_at: EXPIRES,
        apply_after: "2026-11-19T10:00:00Z",
      },
    });
    const { controller } = make();

    controller.start();
    await flush();
    const pending = devices.get(`pending:${REQUEST_ID}`) as FakeDevice;

    await tick(1000);
    expect(controller.get_state().phase).toBe("rescue");
    expect(pending.forget).toHaveBeenCalled();
    expect(storage.getItem(GUARD_SIGN_IN_STORAGE_KEY)).toBeNull();
    await tick(5000);
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(1);
  });

  it("ends as expired on a 410", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      error: "gone",
      status: 410,
      server_code: "GUARD_REQUEST_GONE",
    });
    const { controller } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(controller.get_state().phase).toBe("expired");
  });

  it("stops polling once the request expires", async () => {
    const { controller } = make();

    controller.start();
    await flush();
    await tick(5 * 60 * 1000 + 1000);
    expect(controller.get_state().phase).toBe("expired");
    const calls = mock(api.guard_sign_in_status).mock.calls.length;

    await tick(5000);
    expect(mock(api.guard_sign_in_status).mock.calls.length).toBe(calls);
  });
});

describe("GuardSignInController complete", () => {
  it("opens the approval envelope and hands over the passphrase", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockResolvedValueOnce(
      complete_body(base64url_encode(new Uint8Array(40))),
    );
    const { controller, finish } = make(fresh(USER_HASH));

    controller.start();
    await flush();
    await tick(1000);

    const device = devices.get(USER_ID) as FakeDevice;

    expect(deps.rekey_device).toHaveBeenCalledWith(
      `pending:${REQUEST_ID}`,
      USER_ID,
    );
    expect(device.set_device_id).toHaveBeenCalledWith("33333333-4444-4555-8666-777777777777");
    expect(device.store_code_secret).toHaveBeenCalled();
    expect(device.open_envelope).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "33333333-4444-4555-8666-777777777777",
    );
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID }),
      "pass phrase",
    );
    expect(hints.get(USER_HASH)).toBe(USER_ID);
    expect(storage.getItem(GUARD_SIGN_IN_STORAGE_KEY)).toBeNull();
    expect(controller.get_state().phase).toBe("done");
  });

  it("uses the typed password when there is no envelope", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockResolvedValueOnce(complete_body(null));
    const { controller, finish } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID }),
      null,
    );
    expect(
      (devices.get(USER_ID) as FakeDevice).open_envelope,
    ).not.toHaveBeenCalled();
  });
});

describe("GuardSignInController clock and interruptions", () => {
  it("keeps waiting when the local clock runs ahead of the server", async () => {
    const six_minutes = 6 * 60 * 1000;

    vi.setSystemTime(NOW + six_minutes);
    set_server_time_offset_for_tests(-six_minutes);
    deps = { ...deps, now: default_guard_sign_in_deps.now };
    const { controller } = make();

    controller.start();
    await flush();
    expect(controller.get_state().phase).toBe("waiting");
    expect(
      read_stored_guard_sign_in(storage as unknown as Storage)?.request_id,
    ).toBe(REQUEST_ID);
    controller.stop();
  });

  it("does not sign in after Back is pressed during completion", async () => {
    let release: (value: unknown) => void = () => undefined;

    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { controller, finish } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(controller.get_state().phase).toBe("completing");
    controller.cancel();
    release(complete_body(null));
    await flush();
    expect(finish).not.toHaveBeenCalled();
    expect(controller.get_state().phase).not.toBe("done");
  });

  it("retries completion once after a network failure", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete)
      .mockResolvedValueOnce({ error: "network" })
      .mockResolvedValueOnce(complete_body(null));
    const { controller, finish } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(api.guard_sign_in_complete).toHaveBeenCalledTimes(2);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(controller.get_state().phase).toBe("done");
  });

  it("does not retry completion the server refused", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockResolvedValueOnce({
      error: "bad",
      status: 400,
      server_code: "GUARD_ACTION_INVALID",
    });
    const { controller, finish } = make();

    controller.start();
    await flush();
    await tick(1000);
    expect(api.guard_sign_in_complete).toHaveBeenCalledTimes(1);
    expect(finish).not.toHaveBeenCalled();
    expect(controller.get_state().phase).toBe("error");
  });

  it("retries finishing the sign-in once", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockResolvedValueOnce(complete_body(null));
    const finish = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error("vault"));
    const { controller } = make(fresh(), finish);

    controller.start();
    await flush();
    await tick(1000);
    expect(finish).toHaveBeenCalledTimes(2);
    expect(controller.get_state().phase).toBe("done");
  });
});

describe("GuardSignInController resume", () => {
  it("signs a resume with a known device instead of making a new one", async () => {
    hints.set(USER_HASH, USER_ID);
    devices.set(USER_ID, fake_device("44444444-5555-4666-8777-888888888888"));
    mock(api.guard_sign_in_resume_nonce).mockResolvedValueOnce({
      data: { nonce: base64url_encode(new Uint8Array(32).fill(7)), expires_at: EXPIRES },
    });
    const { controller } = make(fresh(USER_HASH));

    controller.start();
    await flush();
    expect(api.guard_sign_in_resume_nonce).toHaveBeenCalledWith(TOKEN, {
      device_id: "44444444-5555-4666-8777-888888888888",
    });
    expect(deps.create_device).not.toHaveBeenCalled();
    const body = mock(api.guard_sign_in_begin).mock.calls[0][1];

    expect(body.resume).toEqual({
      device_id: "44444444-5555-4666-8777-888888888888",
      nonce: base64url_encode(new Uint8Array(32).fill(7)),
      signature: base64url_encode(new Uint8Array(64).fill(9)),
    });
    controller.stop();
  });

  it("makes a new device after the old one was forgotten", async () => {
    hints.set(USER_HASH, USER_ID);
    const { controller } = make(fresh(USER_HASH));

    controller.start();
    await flush();
    expect(api.guard_sign_in_resume_nonce).not.toHaveBeenCalled();
    expect(deps.create_device).toHaveBeenCalled();
    expect(mock(api.guard_sign_in_begin).mock.calls[0][1].resume).toBeNull();
    controller.stop();
  });

  it("resumes by the account id when there is no username hint", async () => {
    devices.set(USER_ID, fake_device("44444444-5555-4666-8777-888888888888"));
    mock(api.guard_sign_in_resume_nonce).mockResolvedValueOnce({
      data: { nonce: base64url_encode(new Uint8Array(32).fill(7)), expires_at: EXPIRES },
    });
    const { controller } = make(fresh(null, USER_ID));

    controller.start();
    await flush();
    expect(deps.read_hint).not.toHaveBeenCalled();
    expect(deps.create_device).not.toHaveBeenCalled();
    expect(mock(api.guard_sign_in_begin).mock.calls[0][1].resume).toEqual(
      expect.objectContaining({ device_id: "44444444-5555-4666-8777-888888888888" }),
    );
    controller.stop();
  });

  it("replaces a device the server no longer knows", async () => {
    devices.set(USER_ID, fake_device("44444444-5555-4666-8777-888888888888"));
    mock(api.guard_sign_in_resume_nonce).mockResolvedValueOnce({
      error: "not found",
      status: 404,
    });
    const { controller } = make(fresh(null, USER_ID));

    controller.start();
    await flush();
    expect(deps.create_device).toHaveBeenCalled();
    expect(mock(api.guard_sign_in_begin).mock.calls[0][1].resume).toBeNull();
    controller.stop();
  });

  it("keeps the enrolled device when the resume check fails for another reason", async () => {
    const old = fake_device("44444444-5555-4666-8777-888888888888");

    devices.set(USER_ID, old);
    mock(api.guard_sign_in_resume_nonce).mockResolvedValueOnce({
      error: "unavailable",
      status: 503,
    });
    const { controller } = make(fresh(null, USER_ID));

    controller.start();
    await flush();
    expect(deps.create_device).not.toHaveBeenCalled();
    expect(api.guard_sign_in_begin).not.toHaveBeenCalled();
    expect(devices.get(USER_ID)).toBe(old);
    expect(old.forget).not.toHaveBeenCalled();
    expect(controller.get_state().phase).toBe("error");
  });

  it("keeps the pending device until the approval is fully opened", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockResolvedValueOnce(
      complete_body(base64url_encode(new Uint8Array(40))),
    );
    const { controller, finish } = make();

    controller.start();
    await flush();
    const pending = devices.get(`pending:${REQUEST_ID}`) as FakeDevice;

    pending.open_envelope.mockRejectedValueOnce(new Error("bad envelope"));
    await tick(1000);
    await flush();
    expect(deps.rekey_device).not.toHaveBeenCalled();
    expect(pending.forget).toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
    expect(controller.get_state().phase).toBe("error");
  });

  it("refuses an approval for a different account", async () => {
    mock(api.guard_sign_in_status).mockResolvedValueOnce({
      data: { status: "approved", expires_at: EXPIRES, apply_after: null },
    });
    mock(api.guard_sign_in_complete).mockResolvedValueOnce(complete_body(null));
    const { controller, finish } = make(
      fresh(null, "99999999-3333-4444-8555-666666666666"),
    );

    controller.start();
    await flush();
    await tick(1000);
    expect(finish).not.toHaveBeenCalled();
    expect(deps.rekey_device).not.toHaveBeenCalled();
    expect(controller.get_state().phase).toBe("error");
  });

  it("forgets the new device when the screen closes before it is sent", async () => {
    const { controller } = make();

    controller.start();
    controller.stop();
    await flush();
    const created = mock(deps.create_device).mock.results[0];
    const device = (await created?.value) as FakeDevice | undefined;

    expect(device?.forget).toHaveBeenCalled();
    expect(storage.getItem(GUARD_SIGN_IN_STORAGE_KEY)).toBeNull();
  });
});

describe("GuardSignInController reload", () => {
  it("picks up a stored request without starting a new one", async () => {
    const first = make();

    first.controller.start();
    await flush();
    first.controller.stop();
    const stored = read_stored_guard_sign_in(
      storage as unknown as Storage,
      Date.now(),
    );

    expect(stored?.request_id).toBe(REQUEST_ID);
    expect(stored?.number).toBe(first.controller.get_state().number);
    vi.clearAllMocks();
    const second = make({ kind: "stored", stored: stored! });

    second.controller.start();
    await tick(0);
    expect(api.guard_sign_in_begin).not.toHaveBeenCalled();
    expect(api.guard_sign_in_status).toHaveBeenCalledTimes(1);
    expect(second.controller.get_state().number).toBe(stored?.number);
    second.controller.stop();
  });

  it("drops a stored request that already expired", () => {
    storage.setItem(
      GUARD_SIGN_IN_STORAGE_KEY,
      JSON.stringify({
        request_id: REQUEST_ID,
        guard_token: TOKEN,
        expires_at: "2026-11-15T09:00:00Z",
        number: 42,
        device_key: `pending:${REQUEST_ID}`,
        user_hash: null,
      }),
    );
    expect(
      read_stored_guard_sign_in(storage as unknown as Storage, Date.now()),
    ).toBeNull();
    expect(storage.getItem(GUARD_SIGN_IN_STORAGE_KEY)).toBeNull();
  });
});

describe("GuardSignInController codes", () => {
  it("normalizes a typed Guard code", () => {
    expect(normalize_guard_code(" bc-d f2 ")).toBe("BCDF2");
    expect(normalize_guard_code("BCDF")).toBeNull();
    expect(normalize_guard_code("BCDF0")).toBeNull();
  });

  it("flags a rejected code so the field clears", async () => {
    mock(api.guard_sign_in_code).mockResolvedValueOnce({
      error: "bad",
      status: 400,
      server_code: "GUARD_ACTION_INVALID",
    });
    const { controller } = make();

    controller.start();
    await flush();
    await controller.submit_code("bcdf2");
    expect(api.guard_sign_in_code).toHaveBeenCalledWith(TOKEN, "BCDF2");
    expect(controller.get_state().code_error).toBe(true);
    controller.stop();
  });

  it("flags a malformed code without calling the server", async () => {
    const { controller } = make();

    controller.start();
    await flush();
    await controller.submit_code("12");
    expect(api.guard_sign_in_code).not.toHaveBeenCalled();
    expect(controller.get_state().code_error).toBe(true);
    controller.stop();
  });

  it("rejects a malformed rescue code without calling the server", async () => {
    const { controller } = make();

    controller.start();
    await flush();
    const ok = await controller.start_rescue("23456-789BC");

    expect(ok).toBe(false);
    expect(api.guard_sign_in_rescue).not.toHaveBeenCalled();
    expect(controller.get_state().rescue_error).toBe(true);
    controller.stop();
  });

  it("starts a rescue and stops polling", async () => {
    mock(api.guard_sign_in_rescue).mockResolvedValueOnce({
      data: { rescue_id: "r1", apply_after: "2026-11-18T10:00:00Z" },
    });
    const { controller } = make();

    controller.start();
    await flush();
    const ok = await controller.start_rescue(RESCUE.toLowerCase());

    expect(ok).toBe(true);
    expect(api.guard_sign_in_rescue).toHaveBeenCalledWith(
      TOKEN,
      RESCUE.replace(/-/g, ""),
    );
    expect(controller.get_state().phase).toBe("rescue");
    expect(controller.get_state().rescue?.apply_after).toBe(
      "2026-11-18T10:00:00Z",
    );
    await tick(5000);
    expect(api.guard_sign_in_status).not.toHaveBeenCalled();
  });

  it("ignores a rescue answer that arrives after the person canceled", async () => {
    let answer: (v: unknown) => void = () => {};
    mock(api.guard_sign_in_rescue).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const { controller } = make();

    controller.start();
    await flush();
    const pending = controller.start_rescue(RESCUE);

    controller.cancel();
    answer({ data: { rescue_id: "r1", apply_after: "2026-11-18T10:00:00Z" } });

    expect(await pending).toBe(false);
    expect(controller.get_state().phase).not.toBe("rescue");
  });
});
