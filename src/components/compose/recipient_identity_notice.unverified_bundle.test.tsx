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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  pinned_owner: "fp:owner" as string | null,
  flagged: new Set<string>(),
  accepted: new Set<string>(),
  verdict: "tampered" as string,
  trusted: [] as Array<[string, string | null, string | null, unknown]>,
  listeners: [] as Array<() => void>,
  bundle: {
    kem_identity_key: "kem",
    signed_prekey: "spk",
    signed_prekey_signature: "sig",
    pq_kem_public_key: "pq",
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.email ? `${key}:${params.email}` : key,
  }),
}));

vi.mock("@/services/recipient_classification", () => ({
  is_internal_recipient: (email: string) => email.endsWith("@astermail.org"),
  use_recipient_classification: () => 0,
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: (email: string) => email.endsWith("@astermail.org"),
  get_recipient_public_key: vi.fn(async () => ({
    data: { public_key: "owner" },
  })),
}));

vi.mock("@/services/crypto/key_manager_core", () => ({
  base64_to_array: (value: string) => new TextEncoder().encode(value),
  compute_hash: async (bytes: Uint8Array) => new TextDecoder().decode(bytes),
}));

vi.mock("@/services/crypto/key_manager_pgp", () => ({
  verify_ratchet_prekey_bundle_detailed: vi.fn(async () => ({
    verdict: h.verdict,
    format: "v2",
    strict: false,
  })),
}));

vi.mock("@/services/crypto/ratchet_prekey_bundle", () => ({
  fetch_ratchet_identity: vi.fn(async () => ({
    user_id: "u",
    ...h.bundle,
  })),
  fetch_prekey_bundle: vi.fn(async () => ({
    ...h.bundle,
    one_time_prekey: "otk",
  })),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", () => ({
  acknowledge_identity_change: vi.fn(async () => undefined),
  get_identity_change: vi.fn(async () => null),
  get_pinned_identity_fingerprint: vi.fn(async () => null),
  get_pinned_owner_key_fingerprint: vi.fn(async () => h.pinned_owner),
  get_recipient_pin_health: vi.fn(async () => "settled"),
  is_recipient_bundle_accepted: vi.fn(async (pin_id: string) =>
    h.accepted.has(pin_id),
  ),
  is_recipient_flagged_untrusted: vi.fn(async (pin_id: string) =>
    h.flagged.has(pin_id),
  ),
  owner_key_fingerprint: vi.fn(async (armored: string) => `fp:${armored}`),
  trust_recipient_keys: vi.fn(
    async (
      pin_id: string,
      kem: string | null,
      owner: string | null,
      accepted_bundle: unknown = null,
    ) => {
      h.trusted.push([pin_id, kem, owner, accepted_bundle]);
      h.flagged.delete(pin_id);

      if (accepted_bundle) h.accepted.add(pin_id);
    },
  ),
}));

vi.mock("@/services/crypto/ratchet_verification_status", () => ({
  subscribe_peer_identity_events: (listener: () => void) => {
    h.listeners.push(listener);

    return () => {
      h.listeners = h.listeners.filter((entry) => entry !== listener);
    };
  },
}));

import { RecipientIdentityNotice } from "@/components/compose/recipient_identity_notice";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

async function render(recipients: string[]) {
  const container = document.createElement("div");

  document.body.appendChild(container);

  const root = createRoot(container);

  await act(async () => {
    root.render(<RecipientIdentityNotice recipients={recipients} />);
  });
  mounted.push({ root, container });

  return container;
}

function trust_button(container: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "mail.trust_new_key",
    ) ?? null
  );
}

beforeEach(() => {
  h.pinned_owner = "fp:owner";
  h.flagged = new Set();
  h.accepted = new Set();
  h.verdict = "tampered";
  h.trusted = [];
  h.listeners = [];
});

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("RecipientIdentityNotice for a key that cannot be verified", () => {
  it("offers Trust new key for an alias recipient whose bundle does not verify", async () => {
    const container = await render(["Tej-Berlin@astermail.org"]);

    expect(
      container.querySelector('[data-testid="recipient-identity-untrusted"]')
        ?.textContent,
    ).toContain("mail.recipient_identity_untrusted:tej-berlin@astermail.org");
    expect(trust_button(container)).not.toBeNull();
  });

  it("records the accepted bundle only after the user clicks, then clears the notice", async () => {
    const container = await render(["tej-berlin@astermail.org"]);

    expect(h.trusted).toEqual([]);

    await act(async () => {
      trust_button(container)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(h.trusted).toEqual([
      [
        "tej-berlin@astermail.org",
        "kem",
        "owner",
        { ...h.bundle, one_time_prekey: "otk" },
      ],
    ]);
    expect(trust_button(container)).toBeNull();
  });

  it("shows the option once a blocked send flags the recipient", async () => {
    h.pinned_owner = null;

    const container = await render(["tej-berlin@astermail.org"]);

    expect(trust_button(container)).toBeNull();

    h.flagged.add("tej-berlin@astermail.org");

    await act(async () => {
      h.listeners.forEach((listener) => listener());
    });

    expect(trust_button(container)).not.toBeNull();
  });

  it("stays hidden when the bundle verifies", async () => {
    h.verdict = "verified";

    const container = await render(["tej-berlin@astermail.org"]);

    expect(container.innerHTML).toBe("");
  });
});
