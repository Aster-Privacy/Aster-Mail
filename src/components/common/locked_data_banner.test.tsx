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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  auth: {
    vault: { identity_key: "key" } as unknown,
    user: { id: "account-1" } as { id: string } | null,
  },
  preferences: {
    preferences: { locked_data_banner_dismissed: "" },
    update_preference: vi.fn(),
    is_loading: false,
    has_loaded_from_server: true,
  },
  status: null as {
    inactive_key_sets: number;
    locked_sent_mail: number;
    signature: string;
  } | null,
  status_calls: 0,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/hooks/use_accent_contrast_text", () => ({
  use_accent_contrast_text: () => "#ffffff",
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => h.auth,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => h.preferences,
}));

vi.mock("@/components/common/recover_data_modal", () => ({
  RecoverDataModal: ({ is_open }: { is_open: boolean }) =>
    is_open ? <div data-testid="recover-modal" /> : null,
}));

vi.mock("@/services/locked_data", () => ({
  get_locked_data_status: async () => {
    h.status_calls += 1;

    return h.status;
  },
  has_locked_data: (
    status: { inactive_key_sets: number; locked_sent_mail: number } | null,
  ) =>
    !!status && (status.inactive_key_sets > 0 || status.locked_sent_mail > 0),
}));

const { LockedDataBanner } = await import("./locked_data_banner");
const { LOCKED_DATA_CHANGED_EVENT } =
  await import("@/services/locked_sent_mail_store");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const LOCKED = { inactive_key_sets: 1, locked_sent_mail: 0, signature: "a|" };

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<LockedDataBanner />);
  });

  return container;
}

function find_button(view: HTMLElement, label: string) {
  return Array.from(view.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
}

describe("LockedDataBanner", () => {
  beforeEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    h.auth = { vault: { identity_key: "key" }, user: { id: "account-1" } };
    h.preferences = {
      preferences: { locked_data_banner_dismissed: "" },
      update_preference: vi.fn(),
      is_loading: false,
      has_loaded_from_server: true,
    };
    h.status = LOCKED;
    h.status_calls = 0;
  });

  it("shows when an account has locked data", async () => {
    const view = await render();

    expect(view.textContent).toContain("common.locked_data_banner_message");
  });

  it("stays hidden when nothing is locked", async () => {
    h.status = { inactive_key_sets: 0, locked_sent_mail: 0, signature: "|" };

    const view = await render();

    expect(view.textContent).toBe("");
  });

  it("stays hidden until preferences load from the server", async () => {
    h.preferences.has_loaded_from_server = false;

    expect((await render()).textContent).toBe("");
  });

  it("stays hidden while the vault is locked", async () => {
    h.auth.vault = null;

    const view = await render();

    expect(view.textContent).toBe("");
    expect(h.status_calls).toBe(0);
  });

  it("stays hidden when this exact locked set was dismissed", async () => {
    h.preferences.preferences.locked_data_banner_dismissed = "a|";

    expect((await render()).textContent).toBe("");
  });

  it("returns when different data becomes locked after a dismissal", async () => {
    h.preferences.preferences.locked_data_banner_dismissed = "a|";
    h.status = {
      inactive_key_sets: 1,
      locked_sent_mail: 2,
      signature: "a|sent",
    };

    const view = await render();

    expect(view.textContent).toContain("common.locked_data_banner_message");
  });

  it("saves the dismissal to the account and hides", async () => {
    const view = await render();

    await act(async () => {
      find_button(view, "common.locked_data_banner_dismiss")!.click();
    });

    expect(h.preferences.update_preference).toHaveBeenCalledWith(
      "locked_data_banner_dismissed",
      "a|",
      true,
    );
    expect(view.textContent).not.toContain("common.locked_data_banner_message");
  });

  it("opens the recovery dialog", async () => {
    const view = await render();

    await act(async () => {
      find_button(view, "common.locked_data_banner_action")!.click();
    });

    expect(view.querySelector("[data-testid='recover-modal']")).not.toBeNull();
  });

  it("hides after recovery clears the locked data", async () => {
    const view = await render();

    h.status = { inactive_key_sets: 0, locked_sent_mail: 0, signature: "|" };
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LOCKED_DATA_CHANGED_EVENT));
    });

    expect(view.textContent).not.toContain("common.locked_data_banner_message");
  });
});
