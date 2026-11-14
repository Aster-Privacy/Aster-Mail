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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  puts: [] as string[],
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async (path: string) => {
      h.puts.push(path);

      return { data: { success: true } };
    }),
  },
}));

import {
  IdentityKeyMissingError,
  with_identity_key,
} from "./identity_key_required";

import { update_onboarding_state } from "@/services/api/onboarding";
import { save_subscription_cache } from "@/services/subscription_cache";

const src_root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const WRITERS: Record<string, string> = {
  "services/api/onboarding.ts":
    "derive_onboarding_key(with_identity_key(vault))",
  "services/subscription_cache.ts":
    "derive_subscriptions_key(with_identity_key(vault))",
  "services/import/encrypt.ts": "const owner = with_identity_key(vault);",
  "services/api/multi_drafts.ts":
    "derive_draft_encryption_key(with_identity_key(vault))",
  "services/api/scheduled.ts":
    "derive_scheduled_encryption_key(with_identity_key(vault))",
  "services/api/preferences.ts":
    "derive_preferences_key(with_identity_key(vault))",
  "services/api/preferences_dev_mode.ts":
    "derive_dev_mode_key(with_identity_key(vault))",
};

const ONBOARDING = {
  current_step: 1,
  completed_steps: [0],
  last_seen_step: 1,
  started_at: 1,
};

function vault_with(identity_key?: string): EncryptedVault {
  return { identity_key } as unknown as EncryptedVault;
}

beforeEach(() => {
  h.puts.length = 0;
});

describe("identity key requirement for account data writes", () => {
  it("returns the vault when it holds an identity key", () => {
    const vault = { identity_key: "key" };

    expect(with_identity_key(vault)).toBe(vault);
  });

  it("refuses a vault with no identity key", () => {
    expect(() => with_identity_key({})).toThrow(IdentityKeyMissingError);
    expect(() => with_identity_key({ identity_key: "" })).toThrow(
      IdentityKeyMissingError,
    );
    expect(() => with_identity_key({ identity_key: null })).toThrow(
      IdentityKeyMissingError,
    );
  });

  it("applies the check on every write path", () => {
    for (const [file, expected] of Object.entries(WRITERS)) {
      const source = readFileSync(resolve(src_root, file), "utf8");

      expect(source.includes(expected), file).toBe(true);
    }
  });

  it("sends no onboarding state without an identity key", async () => {
    const result = await update_onboarding_state(ONBOARDING, vault_with());

    expect(result.data.success).toBe(false);
    expect(h.puts).toEqual([]);
  });

  it("saves onboarding state with an identity key", async () => {
    const result = await update_onboarding_state(
      ONBOARDING,
      vault_with("identity"),
    );

    expect(result.data.success).toBe(true);
    expect(h.puts).toEqual(["/core/v1/onboarding"]);
  });

  it("sends no subscription cache without an identity key", async () => {
    const saved = await save_subscription_cache(
      {} as Parameters<typeof save_subscription_cache>[0],
      vault_with(),
    );

    expect(saved).toBe(false);
    expect(h.puts).toEqual([]);
  });

  it("saves the subscription cache with an identity key", async () => {
    const saved = await save_subscription_cache(
      {} as Parameters<typeof save_subscription_cache>[0],
      vault_with("identity"),
    );

    expect(saved).toBe(true);
    expect(h.puts).toEqual(["/settings/v1/preferences/subscriptions"]);
  });
});
