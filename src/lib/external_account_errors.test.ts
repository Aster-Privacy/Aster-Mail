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

import {
  is_app_password_error,
  is_google_mail_target,
  needs_app_password_notice,
} from "@/lib/external_account_errors";

describe("is_app_password_error", () => {
  it("matches Google's explicit app password rejection on any provider", () => {
    expect(
      is_app_password_error(
        "IMAP connection failed: Application-specific password required",
      ),
    ).toBe(true);
  });

  it("matches a generic auth failure only on a Google mailbox", () => {
    const message =
      "IMAP connection failed: [AUTHENTICATIONFAILED] Invalid credentials";

    expect(is_app_password_error(message, { email: "a@gmail.com" })).toBe(true);
    expect(is_app_password_error(message, { email: "a@example.org" })).toBe(
      false,
    );
  });

  it("ignores an unrelated failure", () => {
    expect(
      is_app_password_error("IMAP connection failed: connection timed out", {
        email: "a@gmail.com",
      }),
    ).toBe(false);
  });
});

describe("is_google_mail_target", () => {
  it("excludes accounts that authenticate with OAuth", () => {
    expect(
      is_google_mail_target({ email: "a@gmail.com", protocol: "oauth_imap" }),
    ).toBe(false);
  });

  it("recognizes the host when the address is a custom domain", () => {
    expect(
      is_google_mail_target({ email: "a@example.org", host: "imap.gmail.com" }),
    ).toBe(true);
  });
});

describe("needs_app_password_notice", () => {
  it("covers a Google mailbox with no recorded error", () => {
    expect(
      needs_app_password_notice({ email: "a@gmail.com", protocol: "imap" }),
    ).toBe(true);
  });

  it("leaves other providers on the generic message", () => {
    expect(
      needs_app_password_notice({
        email: "a@example.org",
        protocol: "imap",
        last_sync_error: "IMAP authentication failed",
      }),
    ).toBe(false);
  });
});
