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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RecipientField } from "@/components/compose/compose_recipients";
import {
  collect_pgp_recipients,
  create_recipient_lock_scope,
  forget_recipient_lock_statuses,
  type RecipientLockScope,
} from "@/services/recipient_lock_state";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hosted = new Set<string>();

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { show_encryption_indicators: true },
  }),
}));

vi.mock("@/services/api/keys", () => ({
  is_internal_email: () => false,
  discover_external_keys_batch: vi.fn(async (emails: string[]) => ({
    data: emails.map((email) => ({
      email,
      found: true,
      public_key: "key",
      will_encrypt: true,
      expires_at: null,
    })),
  })),
}));

vi.mock("@/services/recipient_classification", () => ({
  normalize_recipient_address: (email: string) => email.trim().toLowerCase(),
  is_internal_recipient: () => false,
  use_recipient_classification: () => 0,
  classify_recipients: vi.fn(
    async (emails: string[]) =>
      new Map(
        emails.map((email) => [
          email.toLowerCase(),
          hosted.has(email.toLowerCase()) ? "internal" : "external",
        ]),
      ),
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

let container: HTMLDivElement;
let root: Root;

function render_field(
  target: Root,
  scope: RecipientLockScope,
  recipients: string[],
): void {
  target.render(
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
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  hosted.clear();
  forget_recipient_lock_statuses();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("recipient field lock scope", () => {
  it("lists a recipient while its chip shows a lock and drops it on removal", async () => {
    const scope = create_recipient_lock_scope();
    const all = ["bob@example.com", "carol@example.com"];

    act(() => render_field(root, scope, all));
    await settle();

    expect(collect_pgp_recipients(scope, all, null)).toEqual(all);

    act(() => render_field(root, scope, ["carol@example.com"]));
    await settle();

    expect(collect_pgp_recipients(scope, all, null)).toEqual([
      "carol@example.com",
    ]);
  });

  it("keeps two composers apart and forgets a field on unmount", async () => {
    const first = create_recipient_lock_scope();
    const second = create_recipient_lock_scope();
    const other_container = document.createElement("div");
    const other_root = createRoot(other_container);

    act(() => render_field(root, first, ["bob@example.com"]));
    act(() => render_field(other_root, second, []));
    await settle();

    expect(collect_pgp_recipients(first, ["bob@example.com"], null)).toEqual([
      "bob@example.com",
    ]);
    expect(collect_pgp_recipients(second, ["bob@example.com"], null)).toEqual(
      [],
    );

    act(() => root.unmount());
    root = createRoot(container);

    expect(collect_pgp_recipients(first, ["bob@example.com"], null)).toEqual(
      [],
    );

    act(() => other_root.unmount());
  });

  it("forgets on sign-out and lists again once the chip shows a lock", async () => {
    const scope = create_recipient_lock_scope();

    act(() => render_field(root, scope, ["bob@example.com"]));
    await settle();

    act(() => forget_recipient_lock_statuses());

    expect(collect_pgp_recipients(scope, ["bob@example.com"], null)).toEqual(
      [],
    );

    await settle();

    expect(collect_pgp_recipients(scope, ["bob@example.com"], null)).toEqual([
      "bob@example.com",
    ]);
  });

  it("never lists a custom-domain Aster recipient shown with a lock", async () => {
    const scope = create_recipient_lock_scope();

    hosted.add("team@custom-domain.example");

    act(() => render_field(root, scope, ["team@custom-domain.example"]));
    await settle();

    expect(container.querySelector("button[aria-label]")).not.toBeNull();
    expect(
      collect_pgp_recipients(scope, ["team@custom-domain.example"], true),
    ).toEqual([]);
  });
});
