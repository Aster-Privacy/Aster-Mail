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
import { describe, expect, it } from "vitest";

import { academic_error_key } from "./academic_error_text";

describe("academic_error_key", () => {
  it("asks for the captcha when the widget is on screen", () => {
    expect(
      academic_error_key(
        {
          error: "Captcha verification failed",
          status: 403,
          server_code: "CAPTCHA_FAILED",
        },
        true,
      ),
    ).toBe("settings.academic_captcha_required");
  });

  it("does not ask for a captcha the app never showed", () => {
    expect(
      academic_error_key(
        {
          error: "Captcha verification failed",
          status: 403,
          server_code: "CAPTCHA_FAILED",
        },
        false,
      ),
    ).toBe("settings.academic_captcha_unavailable");
  });

  it("reports rate limits", () => {
    expect(
      academic_error_key(
        { status: 429, server_code: "RATE_LIMIT_EXCEEDED" },
        false,
      ),
    ).toBe("settings.academic_too_many_attempts");
    expect(academic_error_key({ status: 429 }, true)).toBe(
      "settings.academic_too_many_attempts",
    );
  });

  it("reports a non-academic address by code even when the message is generic", () => {
    expect(
      academic_error_key(
        {
          error: "Something went wrong",
          status: 400,
          server_code: "VALIDATION_ERROR",
        },
        true,
      ),
    ).toBe("settings.academic_invalid_email");
    expect(academic_error_key({ error: "NOT_ACADEMIC_DOMAIN" }, true)).toBe(
      "settings.academic_invalid_email",
    );
  });

  it("reports an address that is already used", () => {
    expect(
      academic_error_key(
        { error: "EMAIL_ALREADY_USED", status: 409, server_code: "CONFLICT" },
        true,
      ),
    ).toBe("settings.academic_email_in_use");
  });

  it("reports a resend with nothing pending", () => {
    expect(
      academic_error_key({ status: 404, server_code: "NOT_FOUND" }, false),
    ).toBe("settings.academic_no_pending_request");
  });

  it("falls back to the generic message", () => {
    expect(
      academic_error_key({ status: 500, server_code: "INTERNAL_ERROR" }, true),
    ).toBe("settings.academic_request_failed");
    expect(academic_error_key({}, true)).toBe(
      "settings.academic_request_failed",
    );
  });
});
