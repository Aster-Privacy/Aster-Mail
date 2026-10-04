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
import { describe, expect, it, vi } from "vitest";

const complete_oauth_authorize = vi.fn();

vi.mock("@/services/api/external_accounts", () => ({
  complete_oauth_authorize: (...args: unknown[]) =>
    complete_oauth_authorize(...args),
}));

import {
  DESKTOP_OAUTH_CALLBACK_EVENT,
  expect_oauth_state,
  handle_oauth_callback_url,
  parse_oauth_callback_url,
  type DesktopOAuthCallbackDetail,
} from "./desktop_oauth_bridge";

const STATE = "a".repeat(64);

function expect_state(state: string): void {
  expect(
    expect_oauth_state(
      `https://accounts.example/o/oauth2/auth?client_id=x&state=${state}`,
    ),
  ).toBe(true);
}

function next_callback(): Promise<DesktopOAuthCallbackDetail> {
  return new Promise((resolve) => {
    window.addEventListener(
      DESKTOP_OAUTH_CALLBACK_EVENT,
      (event) =>
        resolve((event as CustomEvent<DesktopOAuthCallbackDetail>).detail),
      { once: true },
    );
  });
}

describe("parse_oauth_callback_url", () => {
  it("accepts a callback with state and code", () => {
    expect(
      parse_oauth_callback_url(
        `aster://oauth/callback?state=${STATE}&code=4%2F0A%26b%20c`,
      ),
    ).toEqual({ state: STATE, code: "4/0A&b c" });
  });

  it("accepts a provider error", () => {
    expect(
      parse_oauth_callback_url(
        `aster://oauth/callback?state=${STATE}&error=provider_denied`,
      ),
    ).toEqual({ state: STATE, error: "provider_denied" });
  });

  it("normalizes an unexpected error value", () => {
    expect(
      parse_oauth_callback_url(
        `aster://oauth/callback?state=${STATE}&error=%3Cscript%3E`,
      ),
    ).toEqual({ state: STATE, error: "unknown" });
  });

  it("rejects other schemes, hosts, paths, and malformed states", () => {
    expect(parse_oauth_callback_url("")).toBeNull();
    expect(parse_oauth_callback_url("aster:settings")).toBeNull();
    expect(
      parse_oauth_callback_url(`https://oauth/callback?state=${STATE}&code=x`),
    ).toBeNull();
    expect(
      parse_oauth_callback_url(`aster://other/callback?state=${STATE}&code=x`),
    ).toBeNull();
    expect(
      parse_oauth_callback_url(`aster://oauth/other?state=${STATE}&code=x`),
    ).toBeNull();
    expect(
      parse_oauth_callback_url("aster://oauth/callback?state=short&code=x"),
    ).toBeNull();
    expect(
      parse_oauth_callback_url(`aster://oauth/callback?state=${STATE}`),
    ).toBeNull();
    expect(
      parse_oauth_callback_url(
        `aster://oauth/callback?state=${STATE}&code=${"x".repeat(2049)}`,
      ),
    ).toBeNull();
  });
});

describe("handle_oauth_callback_url", () => {
  it("completes the link and reports the provider", async () => {
    complete_oauth_authorize.mockResolvedValueOnce({
      data: { success: true, provider: "google" },
    });
    const pending = next_callback();

    expect_state("b".repeat(64));
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"b".repeat(64)}&code=abc`,
    );

    expect(complete_oauth_authorize).toHaveBeenCalledWith(
      "b".repeat(64),
      "abc",
    );
    await expect(pending).resolves.toEqual({
      status: "success",
      provider: "google",
    });
  });

  it("maps a wrong account rejection", async () => {
    complete_oauth_authorize.mockResolvedValueOnce({
      error: "forbidden",
      server_code: "OAUTH_WRONG_ACCOUNT",
    });
    const pending = next_callback();

    expect_state("c".repeat(64));
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"c".repeat(64)}&code=abc`,
    );

    await expect(pending).resolves.toEqual({
      status: "error",
      reason: "wrong_account",
    });
  });

  it("passes a server reason through", async () => {
    complete_oauth_authorize.mockResolvedValueOnce({
      data: { success: false, reason: "expired_state" },
    });
    const pending = next_callback();

    expect_state("d".repeat(64));
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"d".repeat(64)}&code=abc`,
    );

    await expect(pending).resolves.toEqual({
      status: "error",
      reason: "expired_state",
    });
  });

  it("reports a provider error without calling the server", async () => {
    complete_oauth_authorize.mockClear();
    const pending = next_callback();

    expect_state("e".repeat(64));
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"e".repeat(64)}&error=provider_denied`,
    );

    await expect(pending).resolves.toEqual({
      status: "error",
      reason: "provider_denied",
    });
    expect(complete_oauth_authorize).not.toHaveBeenCalled();
  });

  it("handles each state only once", async () => {
    complete_oauth_authorize.mockClear();
    complete_oauth_authorize.mockResolvedValue({
      data: { success: true, provider: "google" },
    });
    const url = `aster://oauth/callback?state=${"f".repeat(64)}&code=abc`;

    expect_state("f".repeat(64));
    await handle_oauth_callback_url(url);
    await handle_oauth_callback_url(url);

    expect(complete_oauth_authorize).toHaveBeenCalledTimes(1);
  });
});

describe("pending oauth states", () => {
  it("ignores a callback whose state this app never started", async () => {
    complete_oauth_authorize.mockClear();
    const listener = vi.fn();

    window.addEventListener(DESKTOP_OAUTH_CALLBACK_EVENT, listener);
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"1".repeat(64)}&code=attacker`,
    );
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"2".repeat(64)}&error=provider_denied`,
    );
    window.removeEventListener(DESKTOP_OAUTH_CALLBACK_EVENT, listener);

    expect(complete_oauth_authorize).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects an authorize url without a valid state", () => {
    expect(expect_oauth_state("not a url")).toBe(false);
    expect(expect_oauth_state("https://accounts.example/auth")).toBe(false);
    expect(
      expect_oauth_state("https://accounts.example/auth?state=short"),
    ).toBe(false);
  });

  it("forgets a pending state after it expires", async () => {
    vi.useFakeTimers();
    try {
      complete_oauth_authorize.mockClear();
      expect_state("3".repeat(64));
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);

      await handle_oauth_callback_url(
        `aster://oauth/callback?state=${"3".repeat(64)}&code=abc`,
      );

      expect(complete_oauth_authorize).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a pending state once", async () => {
    complete_oauth_authorize.mockClear();
    complete_oauth_authorize.mockResolvedValue({
      data: { success: true, provider: "google" },
    });
    expect_state("4".repeat(64));

    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"4".repeat(64)}&code=abc`,
    );
    await handle_oauth_callback_url(
      `aster://oauth/callback?state=${"4".repeat(64)}&code=abc`,
    );

    expect(complete_oauth_authorize).toHaveBeenCalledTimes(1);
  });
});
