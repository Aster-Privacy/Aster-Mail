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
import * as openpgp from "openpgp";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RecipientField } from "@/components/compose/compose_recipients";
import {
  collect_pgp_recipients,
  create_recipient_lock_scope,
  forget_recipient_lock_statuses,
  type RecipientLockScope,
} from "@/services/recipient_lock_state";
import { build_client_pgp_copies } from "@/services/client_pgp_copies";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  keys: new Map<string, string>(),
  saved: new Map<string, string>(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { show_encryption_indicators: true, encrypt_emails: true },
  }),
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: () => false,
  discover_external_keys_batch: vi.fn(async (emails: string[]) => ({
    data: emails.map((email) => ({
      email,
      found: h.keys.has(email.toLowerCase()),
      public_key: h.keys.get(email.toLowerCase()) ?? null,
      fingerprint: "fp",
      source: "wkd",
      will_encrypt: true,
      expires_at: null,
      fingerprint_change: null,
    })),
  })),
}));

vi.mock("@/services/crypto/ratchet_identity_pin", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/crypto/ratchet_identity_pin")
  >()),
  lookup_saved_key: async (email: string) => {
    const fingerprint = h.saved.get(email.toLowerCase());

    return fingerprint ? { fingerprint, conflict: false, owner: true } : null;
  },
  check_owner_key_pin: async () => "ok",
}));

vi.mock("@/services/api/preferences", () => ({
  get_cached_preferences: () => null,
}));

vi.mock("@/services/send_queue_signed_mime", () => ({
  build_signed_mime_payload: async () => undefined,
}));

vi.mock("@/services/recipient_classification", () => ({
  normalize_recipient_address: (email: string) => email.trim().toLowerCase(),
  is_internal_recipient: () => false,
  use_recipient_classification: () => 0,
  classify_recipients: vi.fn(
    async (emails: string[]) =>
      new Map(emails.map((email) => [email.toLowerCase(), "external"])),
  ),
}));

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

vi.mock("@/components/common/email_autocomplete", () => ({
  EmailAutocomplete: () => <input />,
}));

vi.mock("@/components/compose/recipient_identity_notice", () => ({
  RecipientIdentityNotice: () => null,
}));

const SAVED = "saved@example.com";
const UNSAVED = "unsaved@example.com";
const MISNAMED = "misnamed@example.com";
const ALL = [SAVED, UNSAVED, MISNAMED];

let container: HTMLDivElement;
let root: Root;

async function public_key_for(email: string): Promise<string> {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email }],
    format: "armored",
  });

  return generated.publicKey;
}

async function fingerprint_of(armored: string): Promise<string> {
  return (await openpgp.readKey({ armoredKey: armored }))
    .getFingerprint()
    .toLowerCase();
}

function render_field(scope: RecipientLockScope, recipients: string[]): void {
  root.render(
    <RecipientField
      input_value=""
      label="To"
      lock_scope={scope}
      on_add_recipient={() => undefined}
      on_input_change={() => undefined}
      on_remove_last={() => undefined}
      on_remove_recipient={() => undefined}
      recipients={recipients}
    />,
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function send_params(recipients: string[], pgp_recipients: string[]) {
  return {
    outside_recipients: recipients,
    subject: "Lock check",
    body: "<p>Lock check</p>",
    from: "me@astermail.org",
    to: recipients,
    cc: [],
    bcc: [],
    attachments: [],
    encrypt_by_default: true,
    pgp_recipients,
  };
}

beforeAll(async () => {
  const saved_key = await public_key_for(SAVED);
  const misnamed_key = await public_key_for("someone@example.net");

  h.keys.set(SAVED, saved_key);
  h.keys.set(UNSAVED, await public_key_for(UNSAVED));
  h.keys.set(MISNAMED, misnamed_key);
  h.saved.set(SAVED, await fingerprint_of(saved_key));
  h.saved.set(MISNAMED, await fingerprint_of(misnamed_key));
}, 60000);

beforeEach(() => {
  forget_recipient_lock_statuses();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("recipient lock with real key checks", () => {
  it("shows the lock only for a saved key that names the address", async () => {
    const scope = create_recipient_lock_scope();

    act(() => render_field(scope, ALL));
    await settle();

    expect(collect_pgp_recipients(scope, ALL, null)).toEqual([SAVED]);
  });

  it("encrypts the send only for the recipient whose chip shows the lock", async () => {
    const scope = create_recipient_lock_scope();

    act(() => render_field(scope, ALL));
    await settle();

    for (const recipient of ALL) {
      const copies = await build_client_pgp_copies(
        send_params([recipient], collect_pgp_recipients(scope, [recipient], null)),
      );

      expect(Object.keys(copies ?? {})).toEqual(
        recipient === SAVED ? [SAVED] : [],
      );
    }

    for (const recipient of ALL) {
      const unlisted = await build_client_pgp_copies(send_params([recipient], []));

      expect(Object.keys(unlisted ?? {})).toEqual(
        recipient === SAVED ? [SAVED] : [],
      );
    }
  });
});
