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

import {
  password_forms,
  try_password_forms,
} from "@/services/sign_in_password_forms";

const composed = "caf\u00e9";
const decomposed = "cafe\u0301";
const wrong = { error: "no", server_code: "INVALID_CREDENTIALS" };
const allow = async () => true;

interface Answer {
  data?: string;
  error?: string;
  server_code?: string;
}

function server_with(stored: string) {
  return vi.fn(
    async (form: string): Promise<Answer> =>
      form === stored ? { data: "session" } : wrong,
  );
}

describe("password_forms", () => {
  it("gives one form for a password that has a single encoding", () => {
    expect(password_forms("correct horse 42")).toEqual(["correct horse 42"]);
  });

  it("puts the typed form first and adds the other encoding", () => {
    expect(password_forms(composed)).toEqual([composed, decomposed]);
    expect(password_forms(decomposed)).toEqual([decomposed, composed]);
  });

  it("gives three forms for a password that mixes both encodings", () => {
    const mixed = composed + decomposed;

    expect(password_forms(mixed)).toEqual([
      mixed,
      composed + composed,
      decomposed + decomposed,
    ]);
  });
});

describe("try_password_forms", () => {
  it("makes one attempt when the typed form works", async () => {
    const attempt = server_with(composed);
    const before_retry = vi.fn(allow);
    const outcome = await try_password_forms(composed, attempt, before_retry);

    expect(outcome).toEqual({
      response: { data: "session" },
      password: composed,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(before_retry).not.toHaveBeenCalled();
  });

  it("makes one attempt for a wrong password with a single encoding", async () => {
    const attempt = server_with("something else");
    const outcome = await try_password_forms("hunter2", attempt, allow);

    expect(outcome).toEqual({ response: wrong, password: "hunter2" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("signs in with the other encoding and reports the form that worked", async () => {
    const attempt = server_with(decomposed);
    const outcome = await try_password_forms(composed, attempt, allow);

    expect(outcome).toEqual({
      response: { data: "session" },
      password: decomposed,
    });
    expect(attempt.mock.calls.map((call) => call[0])).toEqual([
      composed,
      decomposed,
    ]);
  });

  it("works in the other direction too", async () => {
    const outcome = await try_password_forms(
      decomposed,
      server_with(composed),
      allow,
    );

    expect(outcome.password).toBe(composed);
    expect(outcome.response).toEqual({ data: "session" });
  });

  it("keeps the first answer when no form works", async () => {
    const first = { ...wrong, error: "first" };
    const attempt = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValue({ ...wrong, error: "later" });
    const outcome = await try_password_forms(composed, attempt, allow);

    expect(outcome).toEqual({ response: first, password: composed });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("stops when a retry is not allowed", async () => {
    const attempt = server_with(decomposed);
    const outcome = await try_password_forms(
      composed,
      attempt,
      async () => false,
    );

    expect(outcome).toEqual({ response: wrong, password: composed });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does not retry after an answer that is not about the password", async () => {
    const limited = { error: "slow down", server_code: "RATE_LIMIT_EXCEEDED" };
    const attempt = vi.fn(async () => limited);
    const outcome = await try_password_forms(composed, attempt, allow);

    expect(outcome).toEqual({ response: limited, password: composed });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("returns a later answer that is not about the password", async () => {
    const locked = { error: "locked", server_code: "ACCOUNT_LOCKED" };
    const attempt = vi
      .fn()
      .mockResolvedValueOnce(wrong)
      .mockResolvedValue(locked);
    const outcome = await try_password_forms(composed, attempt, allow);

    expect(outcome).toEqual({ response: locked, password: decomposed });
  });
});
