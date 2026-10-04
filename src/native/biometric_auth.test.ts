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
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  native: true,
  available: true,
  verify: vi.fn(async () => {}),
}));

vi.mock("capacitor-native-biometric", () => ({
  NativeBiometric: {
    isAvailable: vi.fn(async () => ({
      isAvailable: h.available,
      biometryType: 1,
    })),
    verifyIdentity: h.verify,
  },
}));

vi.mock("./capacitor_bridge", () => ({
  is_native_platform: () => h.native,
}));

import { authenticate_biometric } from "./biometric_auth";

describe("authenticate_biometric", () => {
  beforeEach(() => {
    h.native = true;
    h.available = true;
    h.verify.mockReset();
    h.verify.mockResolvedValue(undefined);
  });

  it("succeeds only after the system confirms the user", async () => {
    expect(await authenticate_biometric("unlock")).toBe(true);
    expect(h.verify).toHaveBeenCalledTimes(1);
  });

  it("fails when the system rejects the user", async () => {
    h.verify.mockRejectedValue(new Error("denied"));

    expect(await authenticate_biometric("unlock")).toBe(false);
  });

  it("fails closed when biometrics become unavailable", async () => {
    h.available = false;

    expect(await authenticate_biometric("unlock")).toBe(false);
    expect(h.verify).not.toHaveBeenCalled();
  });

  it("fails closed outside the native app", async () => {
    h.native = false;

    expect(await authenticate_biometric("unlock")).toBe(false);
  });
});
