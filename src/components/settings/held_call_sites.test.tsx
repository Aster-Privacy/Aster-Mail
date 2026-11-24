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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { held_of } from "@/services/guard/held_outcome";

const HELD_CALL_SITES: { endpoint: string; file: string }[] = [
  { endpoint: "forwarding toggle, create, update", file: "src/components/settings/auto_forward_section.tsx" },
  { endpoint: "mail rule create, update", file: "src/stores/mail_rules_store.ts" },
  { endpoint: "mail rule editor", file: "src/components/modals/rule_editor_modal.tsx" },
  { endpoint: "sender rule from inbox", file: "src/components/email/inbox/category_sender_rule.ts" },
  { endpoint: "recovery email save, remove", file: "src/services/api/recovery_email.ts" },
  { endpoint: "recovery email settings", file: "src/components/settings/account_section.tsx" },
  { endpoint: "recovery email mobile settings", file: "src/pages/mobile/settings/account_section.tsx" },
  { endpoint: "password change, session revoke", file: "src/components/settings/hooks/use_security/hook.ts" },
  { endpoint: "two-factor off", file: "src/components/settings/totp_disable_modal.tsx" },
  { endpoint: "hardware key remove", file: "src/components/settings/security/hardware_keys_section.tsx" },
  { endpoint: "data export", file: "src/components/settings/export_modal.tsx" },
  { endpoint: "PGP export", file: "src/components/settings/hooks/use_encryption.ts" },
  { endpoint: "trusted device revoke, revoke all", file: "src/components/settings/trusted_devices_panel.tsx" },
  { endpoint: "account recovery complete", file: "src/pages/forgot_password/use_recovery_flow.ts" },
];

function source(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("held call sites", () => {
  it.each(HELD_CALL_SITES)("$endpoint checks for a held response", ({ file }) => {
    const text = source(file);

    expect(/held_of\(|\.held\b|get_last_save_held/.test(text)).toBe(true);
  });

  it("shows when a held mail app turns on", () => {
    const modal = source("src/components/settings/smtp_token_create_modal.tsx");
    const api = source("src/services/api/smtp_tokens.ts");

    expect(modal).toContain("activates_at");
    expect(modal).toContain("guard.mail_app_activates_at");
    expect(api).toContain("activates_at: response.data.activates_at");
  });

  it("shows the recovery wait instead of new codes", () => {
    const page = source("src/pages/forgot_password/page.tsx");

    expect(page).toContain('case "guard_held"');
    expect(page).toContain("guard.recovery_held_body");
  });
});

describe("held_of", () => {
  const LATER = "2026-11-18T12:00:00Z";
  const ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

  it("reads the held info from a 202 response", () => {
    const held = {
      id: ID,
      kind: "forwarding_change" as const,
      apply_after: LATER,
      skippable: true,
    };

    expect(held_of({ held })).toEqual(held);
  });

  it("reads a 409 GUARD_HELD whose header was lost", () => {
    expect(
      held_of({
        error: "held",
        server_code: "GUARD_HELD",
        details: { id: ID, kind: "password_change", apply_after: LATER },
      }),
    ).toEqual({
      id: ID,
      kind: "password_change",
      apply_after: LATER,
      skippable: true,
    });
  });

  it("marks account recovery as not skippable", () => {
    expect(
      held_of({
        server_code: "GUARD_HELD",
        details: { id: ID, kind: "account_recovery", apply_after: LATER },
      })?.skippable,
    ).toBe(false);
  });

  it("ignores ordinary errors and successes", () => {
    expect(held_of({ error: "nope", server_code: "FORBIDDEN" })).toBeNull();
    expect(held_of({})).toBeNull();
    expect(held_of(null)).toBeNull();
  });
});
