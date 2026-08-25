//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const decrypt_mail_envelope = vi.fn();
let keys_ready = false;
const keys_ready_listeners = new Set<() => void>();

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) => decrypt_mail_envelope(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: () => keys_ready,
  are_keys_ready: () => keys_ready,
  on_keys_ready: (callback: () => void) => {
    if (keys_ready) callback();
    keys_ready_listeners.add(callback);

    return () => {
      keys_ready_listeners.delete(callback);
    };
  },
  get_vault_from_memory: () => null,
  wait_for_keys_ready: async () => keys_ready,
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: async () => ({
    data: {
      id: "m1",
      encrypted_envelope: "envelope",
      envelope_nonce: "nonce",
      is_external: false,
      metadata: {},
      labels: [],
    },
    error: null,
  }),
}));

vi.mock("@/components/email/hooks/preload_cache", () => ({
  await_preloaded_email: async () => null,
  delete_preloaded_email: vi.fn(),
  get_preloaded_email: () => null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/hooks/use_date_format", () => ({
  use_date_format: () => ({
    format_email_detail: () => "",
    format_email_list: () => "",
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { conversation_grouping: true, mark_as_read_delay: "never" },
  }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" } }),
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: null, is_feature_locked: () => false }),
}));

vi.mock("@/components/email/email_viewer_actions", () => ({
  use_email_viewer_actions: () => ({}),
}));

vi.mock("@/services/api/request_cache", () => ({
  request_cache: { clear: vi.fn(), invalidate: vi.fn() },
}));

vi.mock("@/hooks/use_mail_stats", () => ({ adjust_stats_unread: vi.fn() }));

const { use_email_viewer } = await import(
  "@/components/email/use_email_viewer"
);

function release_keys() {
  keys_ready = true;
  for (const callback of [...keys_ready_listeners]) callback();
}

function render_hook(): { errors: (string | null)[]; root: Root } {
  const errors: (string | null)[] = [];

  function Harness() {
    const view = use_email_viewer({ email_id: "m1", on_dismiss: () => {} });

    errors.push(view.error);

    return null;
  }

  const container = document.createElement("div");
  let root!: Root;

  act(() => {
    root = createRoot(container);
    root.render(createElement(Harness));
  });

  return { errors, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

describe("a message that could not be decrypted retries once the keys arrive", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    decrypt_mail_envelope.mockReset();
    decrypt_mail_envelope.mockResolvedValue(null);
    keys_ready = false;
    keys_ready_listeners.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries the decryption after the vault keys become available", async () => {
    const { errors, root } = render_hook();

    await flush();

    expect(errors.at(-1)).toBe("common.failed_to_decrypt_email");

    const attempts_before = decrypt_mail_envelope.mock.calls.length;

    expect(attempts_before).toBeGreaterThan(0);

    await act(async () => {
      release_keys();
    });
    await flush();

    expect(decrypt_mail_envelope.mock.calls.length).toBeGreaterThan(
      attempts_before,
    );

    act(() => root.unmount());
  });

  it("does not retry in a loop while the keys are already available", async () => {
    keys_ready = true;

    const { errors, root } = render_hook();

    await flush();

    expect(errors.at(-1)).toBe("common.failed_to_decrypt_email");

    const attempts = decrypt_mail_envelope.mock.calls.length;

    await flush();
    await flush();

    expect(decrypt_mail_envelope.mock.calls.length).toBe(attempts);

    act(() => root.unmount());
  });
});
