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
import { beforeEach, describe, expect, it } from "vitest";

import {
  clear_ratchet_verification_status,
  is_end_to_end_ratchet_plaintext,
  is_trusted_ratchet_plaintext,
  mark_unauthenticated_plaintext,
  mark_unconfirmed_sender_plaintext,
} from "@/services/crypto/ratchet_verification_status";
import {
  is_ratchet_end_to_end_body,
  is_ratchet_verified_body,
  RATCHET_PENDING_SENTINEL,
  RATCHET_UNDECRYPTABLE_SENTINEL,
} from "@/utils/email_crypto";

const RAW = JSON.stringify({
  type: "double_ratchet_v2",
  sender_identity_key: "sender-identity",
  recipients: {},
});

describe("ratchet end to end status", () => {
  beforeEach(() => {
    clear_ratchet_verification_status();
  });

  it("treats a plaintext from a known sender as end to end and trusted", () => {
    expect(is_end_to_end_ratchet_plaintext("known", "m1")).toBe(true);
    expect(is_trusted_ratchet_plaintext("known", "m1")).toBe(true);
    expect(is_ratchet_end_to_end_body(RAW, "known", "m1")).toBe(true);
    expect(is_ratchet_verified_body(RAW, "known", "m1")).toBe(true);
  });

  it("keeps an unconfirmed sender end to end but not trusted", () => {
    mark_unconfirmed_sender_plaintext("first", "m2");

    expect(is_end_to_end_ratchet_plaintext("first", "m2")).toBe(true);
    expect(is_trusted_ratchet_plaintext("first", "m2")).toBe(false);
    expect(is_ratchet_end_to_end_body(RAW, "first", "m2")).toBe(true);
    expect(is_ratchet_verified_body(RAW, "first", "m2")).toBe(false);
  });

  it("does not treat an unauthenticated plaintext as end to end", () => {
    mark_unauthenticated_plaintext("recovered", "m3");

    expect(is_end_to_end_ratchet_plaintext("recovered", "m3")).toBe(false);
    expect(is_ratchet_end_to_end_body(RAW, "recovered", "m3")).toBe(false);
  });

  it("needs a ratchet envelope and a real plaintext", () => {
    expect(is_ratchet_end_to_end_body("plain server body", "plain")).toBe(
      false,
    );
    expect(is_ratchet_end_to_end_body(RAW, RATCHET_PENDING_SENTINEL)).toBe(
      false,
    );
    expect(
      is_ratchet_end_to_end_body(RAW, RATCHET_UNDECRYPTABLE_SENTINEL),
    ).toBe(false);
    expect(is_ratchet_end_to_end_body(RAW, RAW)).toBe(false);
    expect(is_ratchet_end_to_end_body(RAW, "")).toBe(false);
  });
});
