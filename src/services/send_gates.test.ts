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

const internal = new Set<string>();
const consent = vi.fn();
const discover = vi.fn();

vi.mock("./recipient_classification", () => ({
  classify_recipients: vi.fn(async () => new Map()),
  is_internal_recipient: (email: string) => internal.has(email),
}));
vi.mock("./post_quantum_consent", () => ({
  ensure_post_quantum_consent: (...args: unknown[]) => consent(...args),
}));
vi.mock("@/utils/email_crypto", async (original) => ({
  ...(await original<typeof import("@/utils/email_crypto")>()),
  discover_external_recipient_keys: (...args: unknown[]) => discover(...args),
}));

const { check_scheduled_send } = await import("./scheduled_send_gate");
const { check_reply_send } = await import("./reply_send_gate");
const { assert_required_encryption_keys } =
  await import("./send_queue_execute");
const { get_active_translations } = await import("@/lib/i18n/translations");

const DAY = 24 * 60 * 60 * 1000;
const soon = () => new Date(Date.now() + DAY);
const strings = () => get_active_translations();

function key_for(email: string) {
  return {
    email,
    has_key: true,
    public_key: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
    fingerprint: "f",
    source: "wkd",
  };
}

beforeEach(() => {
  internal.clear();
  internal.add("me@astermail.org");
  internal.add("friend@astermail.org");
  consent.mockReset();
  consent.mockResolvedValue({ proceed: true, allow_non_post_quantum: false });
  discover.mockReset();
});

describe("check_scheduled_send", () => {
  it("blocks times past the 28 day window before classifying", async () => {
    const result = await check_scheduled_send(
      ["friend@astermail.org"],
      "me@astermail.org",
      new Date(Date.now() + 29 * DAY),
      false,
    );

    expect(result).toEqual({
      proceed: false,
      blocked_by: "common.scheduled_too_far_ahead",
    });
  });

  it("blocks mixed Aster and outside recipients", async () => {
    const result = await check_scheduled_send(
      ["friend@astermail.org", "bob@example.com"],
      "me@astermail.org",
      soon(),
      false,
    );

    expect(result).toEqual({
      proceed: false,
      blocked_by: "common.cannot_mix_recipients",
    });
  });

  it("blocks outside recipients when encryption is required", async () => {
    const result = await check_scheduled_send(
      ["bob@example.com"],
      "me@astermail.org",
      soon(),
      true,
    );

    expect(result).toEqual({
      proceed: false,
      blocked_by: "common.scheduled_requires_encryption",
    });
  });

  it("runs post-quantum consent for Aster recipients", async () => {
    consent.mockResolvedValue({ proceed: true, allow_non_post_quantum: true });

    const result = await check_scheduled_send(
      ["friend@astermail.org"],
      "me@astermail.org",
      soon(),
      true,
    );

    expect(consent).toHaveBeenCalledWith(
      ["friend@astermail.org"],
      "me@astermail.org",
    );
    expect(result).toEqual({ proceed: true, allow_non_post_quantum: true });
  });

  it("stops when post-quantum consent is declined", async () => {
    consent.mockResolvedValue({ proceed: false });

    const result = await check_scheduled_send(
      ["friend@astermail.org"],
      undefined,
      soon(),
      false,
    );

    expect(result).toEqual({ proceed: false });
  });

  it("passes an untrusted key block through to the caller", async () => {
    consent.mockResolvedValue({
      proceed: false,
      allow_non_post_quantum: false,
      blocked_by: "errors.recipient_key_untrusted",
    });

    const result = await check_scheduled_send(
      ["friend@astermail.org"],
      "me@astermail.org",
      soon(),
      false,
    );

    expect(result).toEqual({
      proceed: false,
      blocked_by: "errors.recipient_key_untrusted",
    });
  });
});

describe("check_reply_send", () => {
  it("blocks mixed recipients", async () => {
    expect(
      await check_reply_send(
        ["friend@astermail.org", "bob@example.com"],
        false,
      ),
    ).toBe(strings().common.cannot_mix_recipients);
  });

  it("blocks outside recipients without a key when encryption is required", async () => {
    discover.mockResolvedValue({ recipients_with_keys: [] });

    expect(await check_reply_send(["bob@example.com"], true)).toBe(
      strings().errors.cannot_send_no_recipient_keys,
    );
  });

  it("names the outside recipients that have no key", async () => {
    discover.mockResolvedValue({
      recipients_with_keys: [key_for("bob@example.com")],
    });

    const error = await check_reply_send(
      ["bob@example.com", "eve@example.com"],
      true,
    );

    expect(error).toContain("eve@example.com");
    expect(error).not.toContain("bob@example.com");
  });

  it("allows outside recipients with keys when encryption is required", async () => {
    discover.mockResolvedValue({
      recipients_with_keys: [key_for("bob@example.com")],
    });

    expect(await check_reply_send(["bob@example.com"], true)).toBeNull();
    expect(discover).toHaveBeenCalledWith(["bob@example.com"], true);
  });

  it("blocks when key discovery fails and encryption is required", async () => {
    discover.mockRejectedValue(new Error("network"));

    expect(await check_reply_send(["bob@example.com"], true)).not.toBeNull();
  });

  it("blocks when recipients cannot be classified", async () => {
    const { classify_recipients } = await import("./recipient_classification");

    vi.mocked(classify_recipients).mockRejectedValueOnce(new Error("offline"));

    expect(await check_reply_send(["friend@astermail.org"], false)).toBe(
      strings().errors.key_trust_check_failed,
    );
  });

  it("allows outside recipients when encryption is optional", async () => {
    expect(await check_reply_send(["bob@example.com"], false)).toBeNull();
  });

  it("allows Aster recipients when encryption is required", async () => {
    expect(await check_reply_send(["friend@astermail.org"], true)).toBeNull();
  });
});

describe("assert_required_encryption_keys", () => {
  it("passes when every outside recipient has a key", async () => {
    await expect(
      assert_required_encryption_keys(
        ["bob@example.com", "Ann@Example.com"],
        [key_for("bob@example.com"), key_for("ann@example.com")],
      ),
    ).resolves.toBeUndefined();
    expect(discover).not.toHaveBeenCalled();
  });

  it("names the recipients without a key", async () => {
    await expect(
      assert_required_encryption_keys(
        ["bob@example.com", "eve@example.com"],
        [key_for("bob@example.com")],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("eve@example.com"),
    });
  });

  it("ignores lookup results that carry no usable key", async () => {
    await expect(
      assert_required_encryption_keys(
        ["bob@example.com"],
        [{ ...key_for("bob@example.com"), has_key: false, public_key: null }],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("bob@example.com"),
    });
  });

  it("discovers keys when none were supplied", async () => {
    discover.mockResolvedValue({ recipients_with_keys: [] });

    await expect(
      assert_required_encryption_keys(["bob@example.com"]),
    ).rejects.toMatchObject({
      message: strings().errors.cannot_send_no_recipient_keys,
    });
    expect(discover).toHaveBeenCalledWith(["bob@example.com"], true);
  });

  it("does nothing without outside recipients", async () => {
    await expect(assert_required_encryption_keys([])).resolves.toBeUndefined();
  });
});
