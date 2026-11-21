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

import {
  SIGN_OUT_COOKIE,
  announce_sign_out,
  hash_account_id,
  parse_sign_out_marker,
  sign_out_cookie_attributes,
  watch_sign_out_signal,
} from "./sign_out_signal";

import { api_client } from "@/services/api/client";

const ACCOUNT_A = "0f6c2f1e-6a4b-4c5e-9d3a-1b2c3d4e5f60";
const ACCOUNT_B = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

let jar = new Map<string, string>();
let cookie_writes: string[] = [];
const stops: Array<() => void> = [];

function install_cookie_jar(): void {
  jar = new Map();
  cookie_writes = [];
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () =>
      Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    set: (raw: string) => {
      cookie_writes.push(raw);
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");

      jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    },
  });
}

function watch(
  account_id: string,
  on_signal: () => Promise<boolean>,
  since = 0,
): void {
  stops.push(watch_sign_out_signal({ account_id, on_signal, since }));
}

async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  install_cookie_jar();
});

afterEach(() => {
  while (stops.length > 0) stops.pop()?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sign-out marker format", () => {
  it("hashes account ids without exposing them", async () => {
    const hash = await hash_account_id(ACCOUNT_A);

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hash).not.toContain(ACCOUNT_A.slice(0, 8));
    expect(await hash_account_id(ACCOUNT_A)).toBe(hash);
    expect(await hash_account_id(ACCOUNT_B)).not.toBe(hash);
  });

  it("reads a marker among other cookies and rejects malformed ones", () => {
    expect(
      parse_sign_out_marker(
        `csrf_token=abc; ${SIGN_OUT_COOKIE}=1700000000000.0123456789abcdef~fedcba9876543210`,
      ),
    ).toEqual({
      issued_at: 1700000000000,
      hashes: ["0123456789abcdef", "fedcba9876543210"],
    });
    expect(parse_sign_out_marker(`${SIGN_OUT_COOKIE}=nope`)).toBeNull();
    expect(parse_sign_out_marker(`${SIGN_OUT_COOKIE}=12.<script>`)).toBeNull();
    expect(parse_sign_out_marker("csrf_token=abc")).toBeNull();
  });

  it("shares the marker across the Mail and Calendar hosts in production", () => {
    expect(sign_out_cookie_attributes("app.astermail.org", "https:")).toContain(
      "Domain=.astermail.org",
    );
    expect(
      sign_out_cookie_attributes("calendar.astermail.org", "https:"),
    ).toContain("Secure");
    expect(sign_out_cookie_attributes("localhost", "http:")).not.toContain(
      "Domain=",
    );
    expect(sign_out_cookie_attributes("evilastermail.org", "https:")).not.toContain(
      "Domain=",
    );
  });

  it("writes a short-lived marker that keeps other recent sign-outs", async () => {
    await announce_sign_out([ACCOUNT_A], 1_000_000);
    await announce_sign_out([ACCOUNT_B], 1_005_000);

    const marker = parse_sign_out_marker(document.cookie);

    expect(marker?.issued_at).toBe(1_005_000);
    expect(marker?.hashes).toEqual([
      await hash_account_id(ACCOUNT_B),
      await hash_account_id(ACCOUNT_A),
    ]);
    expect(cookie_writes.at(-1)).toContain("Max-Age=120");
  });
});

describe("watching for a sign-out in another tab", () => {
  it("signs out a tab of the same account without focus", async () => {
    const on_signal = vi.fn(async () => true);

    watch(ACCOUNT_A, on_signal);
    await settle();
    await announce_sign_out([ACCOUNT_A]);
    await settle(1000);

    expect(on_signal).toHaveBeenCalledTimes(1);
  });

  it("leaves a tab of a different account alone", async () => {
    const on_signal = vi.fn(async () => true);

    watch(ACCOUNT_B, on_signal);
    await settle();
    await announce_sign_out([ACCOUNT_A]);
    await settle(5000);

    expect(on_signal).not.toHaveBeenCalled();
  });

  it("ignores a marker written before the tab signed in", async () => {
    const on_signal = vi.fn(async () => true);

    await announce_sign_out([ACCOUNT_A], Date.now() - 10_000);
    watch(ACCOUNT_A, on_signal, Date.now());
    await settle(5000);

    expect(on_signal).not.toHaveBeenCalled();
  });

  it("checks again when the session is not yet revoked, then gives up", async () => {
    const on_signal = vi.fn(async () => false);

    watch(ACCOUNT_A, on_signal);
    await settle();
    await announce_sign_out([ACCOUNT_A]);
    await settle(1000);
    await settle(10_000);

    expect(on_signal).toHaveBeenCalledTimes(3);
  });

  it("stops watching once the tab is signed out", async () => {
    const on_signal = vi.fn(async () => true);

    watch(ACCOUNT_A, on_signal);
    await settle();
    await announce_sign_out([ACCOUNT_A], Date.now());
    await settle(1000);
    await announce_sign_out([ACCOUNT_A], Date.now() + 1);
    await settle(3000);

    expect(on_signal).toHaveBeenCalledTimes(1);
  });

  it("checks right away when the tab becomes visible", async () => {
    const on_signal = vi.fn(async () => true);

    stops.push(
      watch_sign_out_signal({
        account_id: ACCOUNT_A,
        on_signal,
        since: 0,
        poll_interval_ms: 60_000,
      }),
    );
    await settle();
    await announce_sign_out([ACCOUNT_A]);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();

    expect(on_signal).toHaveBeenCalledTimes(1);
  });
});

describe("confirming the sign-out with the server", () => {
  it("treats a definitive 401 as signed out", async () => {
    vi.spyOn(api_client, "get").mockResolvedValue({
      code: "UNAUTHORIZED",
    } as never);

    expect(await api_client.confirm_signed_out_elsewhere(ACCOUNT_A)).toBe(true);
  });

  it("keeps the tab signed in when the session is still valid", async () => {
    vi.spyOn(api_client, "get").mockResolvedValue({
      data: { user_id: ACCOUNT_A },
    } as never);

    expect(await api_client.confirm_signed_out_elsewhere(ACCOUNT_A)).toBe(
      false,
    );
  });

  it("never signs out on a network or server error", async () => {
    for (const code of ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT_ERROR"]) {
      vi.spyOn(api_client, "get").mockResolvedValue({ code } as never);

      expect(await api_client.confirm_signed_out_elsewhere(ACCOUNT_A)).toBe(
        false,
      );
    }
  });

  it("treats a session that now belongs to another account as signed out", async () => {
    vi.spyOn(api_client, "get").mockResolvedValue({
      data: { user_id: ACCOUNT_B },
    } as never);

    expect(await api_client.confirm_signed_out_elsewhere(ACCOUNT_A)).toBe(true);
  });
});
