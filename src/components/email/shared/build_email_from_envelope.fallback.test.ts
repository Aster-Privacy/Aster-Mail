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
import { beforeEach, describe, expect, it, vi } from "vitest";

const failures = vi.hoisted(() => ({
  unsubscribe: false,
  bundle: false,
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => null),
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => null),
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(7)),
  has_vault_in_memory: vi.fn(() => false),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

vi.mock("@/utils/unsubscribe_detector", async (import_original) => {
  const actual =
    await import_original<typeof import("@/utils/unsubscribe_detector")>();

  return {
    ...actual,
    detect_unsubscribe_info: (
      ...args: Parameters<typeof actual.detect_unsubscribe_info>
    ) => {
      if (failures.unsubscribe) throw new Error("detector failed");

      return actual.detect_unsubscribe_info(...args);
    },
  };
});

vi.mock("@/utils/email_crypto", async (import_original) => {
  const actual = await import_original<typeof import("@/utils/email_crypto")>();

  return {
    ...actual,
    extract_subject_bundle: (
      ...args: Parameters<typeof actual.extract_subject_bundle>
    ) => {
      if (failures.bundle) throw new Error("bundle failed");

      return actual.extract_subject_bundle(...args);
    },
  };
});

import {
  build_preview_text,
  process_envelope_body,
} from "./build_email_from_envelope";

import {
  RECEIPT_STYLE_MARKERS,
  build_receipt_style_envelope,
} from "@/components/email/receipt_style_message_fixture";

beforeEach(() => {
  failures.unsubscribe = false;
  failures.bundle = false;
});

describe("receipt-style HTML message through the envelope pipeline", () => {
  it("returns the full HTML body and a preview", async () => {
    const envelope = build_receipt_style_envelope();
    const result = await process_envelope_body(
      envelope,
      "customer@example.test",
      "item-1",
      "pass",
    );

    expect(result.safe_html).toBe(envelope.body_html);
    for (const marker of RECEIPT_STYLE_MARKERS) {
      expect(result.safe_html).toContain(marker);
    }
    expect(build_preview_text(result.body_text, result.safe_html)).not.toBe("");
  });

  it("keeps the body when unsubscribe detection throws", async () => {
    failures.unsubscribe = true;

    const envelope = build_receipt_style_envelope();
    const result = await process_envelope_body(
      envelope,
      "customer@example.test",
      "item-1",
    );

    expect(result.safe_html).toBe(envelope.body_html);
    expect(result.unsubscribe_info).toBeUndefined();
  });

  it("falls back to the raw envelope body when processing throws", async () => {
    failures.bundle = true;

    const envelope = build_receipt_style_envelope();
    const result = await process_envelope_body(
      envelope,
      "customer@example.test",
      "item-1",
    );

    expect(result.safe_html).toBe(envelope.body_html);
    expect(result.body_text).toBe(envelope.body_text);
    expect(result.e2e_verified).toBe(false);
  });

  it("never falls back to an undecrypted body", async () => {
    failures.bundle = true;

    const envelope = build_receipt_style_envelope();

    envelope.body_html = "";
    envelope.body_text =
      "-----BEGIN PGP MESSAGE-----\n\nwcBMA0\n-----END PGP MESSAGE-----";

    const result = await process_envelope_body(envelope);

    expect(result.safe_html).toBeUndefined();
    expect(result.body_text).toBe("");
  });
});
