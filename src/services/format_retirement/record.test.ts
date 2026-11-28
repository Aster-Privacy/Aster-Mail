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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  is_format_refused,
  merge_format_retirements,
  record_has_format,
  reset_format_retirements,
  sync_format_retirements,
  vault_retires_format,
  with_format_retired,
} from "./record";
import { refusal_mode } from "./switches";
import { without_refused_public_keks } from "./keys";
import { build_remaining_report } from "./report";

import { stored_unbound_policy } from "@/services/crypto/aes_gcm_aad_fallback";

const AT = "2026-11-24T00:00:00.000Z";

afterEach(() => {
  vi.unstubAllEnvs();
  reset_format_retirements();
});

describe("format retirement record", () => {
  it("merges monotonically and keeps the highest class version", () => {
    const merged = merge_format_retirements(
      { v: 1, classes: { escrow_unbound: { v: 1, at: AT } } },
      { v: 1, classes: { escrow_unbound: { v: 2, at: AT } } },
      { v: 1, classes: { ratchet_unbound: { v: 1, at: AT } } },
      { v: 1, classes: { escrow_unbound: { v: 1, at: AT } } },
    );

    expect(merged?.classes.escrow_unbound.v).toBe(2);
    expect(merged?.classes.ratchet_unbound.v).toBe(1);
  });

  it("never loses a class when a stale copy is merged last", () => {
    const server = with_format_retired({}, "escrow_unbound", 1, 0);
    const merged = merge_format_retirements(server, undefined, {
      v: 1,
      classes: {},
    });

    expect(
      record_has_format({ format_retirements: merged }, "escrow_unbound"),
    ).toBe(true);
  });

  it("ignores malformed records and entries", () => {
    expect(merge_format_retirements(null, "x", { v: "1" })).toBeUndefined();
    expect(
      merge_format_retirements({
        v: 1,
        classes: { escrow_unbound: { v: "x" } },
      })?.classes,
    ).toEqual({});
  });

  it("derives the existing mail and recovery markers", () => {
    expect(
      vault_retires_format(
        { mail_legacy_retired: { v: 1, at: AT } },
        "mail_public_kek",
      ),
    ).toBe(true);
    expect(
      vault_retires_format({ escrow_format: 2 }, "recovery_escrow_legacy"),
    ).toBe(true);
    expect(
      record_has_format(
        { escrow_format: 2 } as never,
        "recovery_escrow_legacy",
      ),
    ).toBe(false);
  });
});

describe("refusal modes", () => {
  it("refuses unbound stored data by default once the marker is set", () => {
    expect(refusal_mode("escrow_unbound")).toBe("after_marker");
    expect(stored_unbound_policy()).toBe("accept_unbound");

    sync_format_retirements({
      format_retirements: with_format_retired({}, "escrow_unbound", 1, 0),
    });

    expect(stored_unbound_policy()).toBe("refuse_unbound");
  });

  it("refuses an unbound item only after the marker in after_marker mode", () => {
    vi.stubEnv("VITE_FORMAT_REFUSAL_ESCROW_UNBOUND", "after_marker");

    expect(stored_unbound_policy("escrow_unbound")).toBe("accept_unbound");

    sync_format_retirements({
      format_retirements: with_format_retired({}, "escrow_unbound", 1, 0),
    });

    expect(stored_unbound_policy("escrow_unbound")).toBe("refuse_unbound");
    expect(stored_unbound_policy("ratchet_unbound")).toBe("accept_unbound");
  });

  it("keeps the old global flag meaning always for stored classes", () => {
    vi.stubEnv("VITE_REFUSE_UNBOUND_STORED_DATA", "true");

    expect(stored_unbound_policy("ratchet_unbound")).toBe("refuse_unbound");
    expect(is_format_refused("inbound_unbound_marker")).toBe(false);
  });

  it("refuses legacy recovery escrow once escrow format 2 is set", () => {
    expect(stored_unbound_policy("recovery_escrow_legacy")).toBe(
      "accept_unbound",
    );

    sync_format_retirements({ escrow_format: 2 });

    expect(stored_unbound_policy("recovery_escrow_legacy")).toBe(
      "refuse_unbound",
    );
  });

  it("forgets retirements when the vault is cleared", () => {
    vi.stubEnv("VITE_FORMAT_REFUSAL_RATCHET_UNBOUND", "after_marker");
    sync_format_retirements({
      format_retirements: with_format_retired({}, "ratchet_unbound", 1, 0),
    });
    reset_format_retirements();

    expect(is_format_refused("ratchet_unbound")).toBe(false);
  });

  it("drops public mail keys from memory only in always mode", () => {
    const list = [{ k: "a2V5", added_at: AT }];

    expect(without_refused_public_keks(list)).toBe(list);
    vi.stubEnv("VITE_FORMAT_REFUSAL_MAIL_PUBLIC_KEK", "always");
    expect(without_refused_public_keks(list)).toEqual(list);
    expect(without_refused_public_keks(undefined)).toBeUndefined();
  });
});

describe("remaining report", () => {
  it("carries only per-class counts", () => {
    expect(
      build_remaining_report({
        escrow_unbound: 3,
        ratchet_unbound: -1,
        ["user_id" as never]: 5,
      }),
    ).toEqual({ v: 1, counts: { escrow_unbound: 3 } });
    expect(build_remaining_report({})).toBeNull();
  });
});
