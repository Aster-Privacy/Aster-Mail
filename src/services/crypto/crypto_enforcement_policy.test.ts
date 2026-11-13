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
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  ENABLE_PQXDH_TRANSCRIPT_BINDING,
  ENFORCE_AUTHENTICATED_RATCHET,
  ENFORCE_STRICT_RECIPIENT_BUNDLE,
  is_pqxdh_transcript_binding_enabled,
  is_strict_recipient_bundle_enforced,
} from "./crypto_enforcement_policy";

describe("crypto enforcement policy defaults", () => {
  it("binds the key agreement transcript by default", () => {
    expect(ENABLE_PQXDH_TRANSCRIPT_BINDING).toBe(true);
    expect(is_pqxdh_transcript_binding_enabled()).toBe(true);
  });

  it("keeps the authenticated ratchet enforced", () => {
    expect(ENFORCE_AUTHENTICATED_RATCHET).toBe(true);
  });

  it("requires a verified recipient bundle by default", () => {
    expect(ENFORCE_STRICT_RECIPIENT_BUNDLE).toBe(true);
    expect(is_strict_recipient_bundle_enforced()).toBe(true);
  });

  it("cannot turn off the verified bundle requirement from the build environment", () => {
    vi.stubEnv("VITE_ENFORCE_STRICT_RECIPIENT_BUNDLE", "0");
    expect(is_strict_recipient_bundle_enforced()).toBe(true);
    vi.stubEnv("VITE_ENFORCE_STRICT_RECIPIENT_BUNDLE", "false");
    expect(is_strict_recipient_bundle_enforced()).toBe(true);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
