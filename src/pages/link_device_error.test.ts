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
import { describe, it, expect } from "vitest";

import { classify_link_error } from "./link_device_error";

describe("classify_link_error", () => {
  it("names the Aster Guard reason before the generic code", () => {
    expect(
      classify_link_error({
        error: "Confirm your identity to continue.",
        code: "FORBIDDEN",
        server_code: "STEP_UP_REQUIRED",
      }),
    ).toEqual({ key: "guard.link_device_step_up_failed", restart: false });
    expect(
      classify_link_error({ code: "NOT_FOUND", server_code: "GUARD_DEVICE_UNKNOWN" }),
    ).toEqual({ key: "guard.link_device_needs_approver", restart: false });
    expect(
      classify_link_error({ server_code: "GUARD_TOO_MANY_REQUESTS" }),
    ).toEqual({ key: "auth.link_device_rate_limited", restart: false });
  });

  it("classifies a rate limit by code when the message is localized", () => {
    const result = classify_link_error({
      error: "Trop de tentatives. Réessayez dans une minute.",
      code: "RATE_LIMIT_EXCEEDED",
    });

    expect(result.key).toBe("auth.link_device_rate_limited");
    expect(result.restart).toBe(false);
  });

  it("classifies a missing code by code when the message is localized", () => {
    const result = classify_link_error({
      error: "Ressource introuvable.",
      code: "NOT_FOUND",
    });

    expect(result.key).toBe("auth.link_device_expired_code");
    expect(result.restart).toBe(true);
  });

  it("classifies a transport failure as a connection problem", () => {
    const result = classify_link_error({
      error: "Connection failed.",
      code: "NETWORK_ERROR",
    });

    expect(result.key).toBe("errors.connection_failed");
    expect(result.restart).toBe(false);
  });

  it("classifies a conflict by code", () => {
    const result = classify_link_error({
      error: "Konflikt.",
      code: "CONFLICT",
    });

    expect(result.key).toBe("auth.link_device_already_linked");
  });

  it("falls back to the generic failure without restarting", () => {
    const result = classify_link_error({
      error: "Something odd happened.",
      code: "SERVER_ERROR",
    });

    expect(result.key).toBe("auth.link_device_failed");
    expect(result.restart).toBe(false);
  });
});
