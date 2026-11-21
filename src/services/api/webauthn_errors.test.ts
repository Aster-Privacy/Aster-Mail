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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/i18n/translations", () => ({
  get_active_translations: () => ({
    common: {
      security_key_error_canceled: "canceled_text",
      security_key_error_timed_out: "timed_out_text",
      security_key_error_already_registered: "already_registered_text",
      security_key_error_not_supported: "not_supported_text",
      security_key_error_needs_pin: "needs_pin_text",
      security_key_error_not_recognized: "not_recognized_text",
      security_key_error_failed: "failed_text",
    },
  }),
}));

import {
  classify_security_key_error,
  describe_security_key_error,
  security_key_error_message,
} from "./webauthn_errors";

const named_error = (name: string) => new DOMException("prompt", name);

describe("classify_security_key_error", () => {
  it("reports a key that is already on the account during registration", () => {
    expect(
      classify_security_key_error(
        named_error("InvalidStateError"),
        "register",
        2000,
        60000,
      ),
    ).toBe("already_registered");
  });

  it("does not report a duplicate key during verification", () => {
    expect(
      classify_security_key_error(
        named_error("InvalidStateError"),
        "verify",
        2000,
        60000,
      ),
    ).toBe("failed");
  });

  it("reports a dismissed registration prompt as canceled", () => {
    expect(
      classify_security_key_error(
        named_error("NotAllowedError"),
        "register",
        4000,
        60000,
      ),
    ).toBe("canceled");
  });

  it("reports a failed verification prompt as an unrecognized key", () => {
    expect(
      classify_security_key_error(
        named_error("NotAllowedError"),
        "verify",
        4000,
        60000,
      ),
    ).toBe("not_recognized");
  });

  it("reports a prompt that ran for the full timeout as timed out", () => {
    expect(
      classify_security_key_error(
        named_error("NotAllowedError"),
        "register",
        60000,
        60000,
      ),
    ).toBe("timed_out");
    expect(
      classify_security_key_error(
        named_error("NotAllowedError"),
        "verify",
        59200,
        60000,
      ),
    ).toBe("timed_out");
  });

  it("ignores the timeout check when no timeout is set", () => {
    expect(
      classify_security_key_error(
        named_error("NotAllowedError"),
        "register",
        90000,
        0,
      ),
    ).toBe("canceled");
  });

  it("reports an aborted prompt as canceled", () => {
    expect(
      classify_security_key_error(
        named_error("AbortError"),
        "verify",
        100,
        60000,
      ),
    ).toBe("canceled");
  });

  it("reports unsupported and blocked contexts as not supported", () => {
    expect(
      classify_security_key_error(
        named_error("NotSupportedError"),
        "register",
        10,
        60000,
      ),
    ).toBe("not_supported");
    expect(
      classify_security_key_error(
        named_error("SecurityError"),
        "register",
        10,
        60000,
      ),
    ).toBe("not_supported");
  });

  it("reports a key that cannot verify the user as needing a PIN", () => {
    expect(
      classify_security_key_error(
        named_error("ConstraintError"),
        "register",
        10,
        60000,
      ),
    ).toBe("needs_pin");
  });

  it("falls back to a generic failure for unknown values", () => {
    expect(
      classify_security_key_error(
        named_error("UnknownError"),
        "register",
        10,
        60000,
      ),
    ).toBe("failed");
    expect(classify_security_key_error(null, "register", 10, 60000)).toBe(
      "failed",
    );
    expect(classify_security_key_error("text", "verify", 10, 60000)).toBe(
      "failed",
    );
  });
});

describe("security_key_error_message", () => {
  it("returns a distinct message for each kind", () => {
    const kinds = [
      "canceled",
      "timed_out",
      "already_registered",
      "not_supported",
      "needs_pin",
      "not_recognized",
      "failed",
    ] as const;

    for (const kind of kinds) {
      expect(security_key_error_message(kind)).toBe(`${kind}_text`);
    }
  });

  it("describes a thrown error in one step", () => {
    expect(
      describe_security_key_error(
        named_error("NotAllowedError"),
        "verify",
        500,
        60000,
      ),
    ).toBe("not_recognized_text");
    expect(
      describe_security_key_error(
        named_error("InvalidStateError"),
        "register",
        500,
        60000,
      ),
    ).toBe("already_registered_text");
  });
});
