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

import { GUARD_ACTION, id_subject } from "@/lib/crypto/guard_action";

const h = vi.hoisted(() => ({
  device: null as Record<string, unknown> | null,
  device_id: "22222222-3333-4444-8555-666666666666" as string | null,
  sign_args: [] as unknown[][],
  leave: vi.fn(),
  forget: vi.fn(),
  sign_fails: false,
}));

vi.mock("@/services/guard/guard_device", () => ({
  get_guard_device: vi.fn(async () => h.device),
  forget_guard_device: h.forget,
}));

vi.mock("@/services/guard/sign_action", () => ({
  sign_guard_action: vi.fn(async (...args: unknown[]) => {
    if (h.sign_fails) throw new Error("offline");
    h.sign_args.push(args);

    return { nonce: "n", signature: "s" };
  }),
}));

vi.mock("@/services/api/guard", () => ({ guard_device_leave: h.leave }));

import { leave_guard_on_sign_out } from "@/services/guard/guard_leave";

const USER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  h.device = { device_id: async () => h.device_id };
  h.device_id = "22222222-3333-4444-8555-666666666666";
  h.sign_args = [];
  h.sign_fails = false;
  h.leave.mockReset().mockResolvedValue({ data: { status: "removed" } });
  h.forget.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe("leave_guard_on_sign_out", () => {
  it("signs remove_device over its own id, leaves, and forgets the keys", async () => {
    await leave_guard_on_sign_out(USER_ID);

    expect(h.sign_args).toHaveLength(1);
    const [, user_id, code, subject, proof] = h.sign_args[0];

    expect(user_id).toBe(USER_ID);
    expect(code).toBe(GUARD_ACTION.remove_device);
    expect(Array.from(subject as Uint8Array)).toEqual(
      Array.from(id_subject(h.device_id as string)),
    );
    expect(proof).toBeUndefined();
    expect(h.leave).toHaveBeenCalledWith({ nonce: "n", signature: "s" });
    expect(h.forget).toHaveBeenCalledWith(USER_ID);
  });

  it("does nothing when this browser holds no Guard keys", async () => {
    h.device = null;
    await leave_guard_on_sign_out(USER_ID);

    expect(h.leave).not.toHaveBeenCalled();
    expect(h.forget).not.toHaveBeenCalled();
  });

  it("forgets the keys even when the server call fails", async () => {
    h.sign_fails = true;
    await expect(leave_guard_on_sign_out(USER_ID)).resolves.toBeUndefined();

    expect(h.leave).not.toHaveBeenCalled();
    expect(h.forget).toHaveBeenCalledWith(USER_ID);
  });

  it("forgets unenrolled keys without calling the server", async () => {
    h.device_id = null;
    await leave_guard_on_sign_out(USER_ID);

    expect(h.leave).not.toHaveBeenCalled();
    expect(h.forget).toHaveBeenCalledWith(USER_ID);
  });
});
