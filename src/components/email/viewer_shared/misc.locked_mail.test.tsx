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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  auth: {
    vault: { identity_key: "key" } as unknown,
    user: { id: "account-1" } as { id: string } | null,
  },
  inactive_key_sets: 1,
  latest_retired_at: Date.parse("2026-05-01T12:00:00Z") as number | null,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => h.auth,
}));

vi.mock("@/components/modals/view_source_modal", () => ({
  ViewSourceModal: () => null,
}));

vi.mock("@/components/common/recover_data_modal", () => ({
  RecoverDataModal: ({ is_open }: { is_open: boolean }) =>
    is_open ? <div data-testid="recover-modal" /> : null,
}));

vi.mock("@/services/locked_data", () => ({
  get_locked_data_status: async () => ({
    inactive_key_sets: h.inactive_key_sets,
    locked_sent_mail: 0,
    signature: "a|",
    latest_retired_at: h.latest_retired_at,
  }),
}));

const { ViewerErrorState } = await import("./misc");
const { is_sealed_before_reset } = await import("./locked_mail_notice");
const { LOCKED_DATA_CHANGED_EVENT } =
  await import("@/services/locked_sent_mail_store");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const BEFORE_RESET = "2026-04-20T08:00:00Z";
const AFTER_RESET = "2026-05-03T08:00:00Z";

async function render(
  decrypt_failed: boolean,
  on_retry = vi.fn(),
  message_created_at: string | null = BEFORE_RESET,
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ViewerErrorState
        decrypt_failed={decrypt_failed}
        error="common.failed_to_decrypt_email"
        message_created_at={message_created_at}
        on_dismiss={() => {}}
        on_retry={on_retry}
      />,
    );
  });

  return container;
}

function find_button(view: HTMLElement, label: string) {
  return Array.from(view.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
}

describe("ViewerErrorState for mail locked by a password reset", () => {
  beforeEach(() => {
    h.auth = { vault: { identity_key: "key" }, user: { id: "account-1" } };
    h.inactive_key_sets = 1;
    h.latest_retired_at = Date.parse("2026-05-01T12:00:00Z");
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("explains the reset and offers recovery when older keys are archived", async () => {
    const view = await render(true);

    expect(view.textContent).toContain("common.locked_mail_after_reset");
    expect(view.textContent).not.toContain("common.failed_to_decrypt_email");

    await act(async () => {
      find_button(view, "common.locked_data_banner_action")!.click();
    });

    expect(view.querySelector("[data-testid='recover-modal']")).not.toBeNull();
  });

  it("keeps the plain error when there are no archived keys", async () => {
    h.inactive_key_sets = 0;

    const view = await render(true);

    expect(view.textContent).toContain("common.failed_to_decrypt_email");
    expect(view.textContent).not.toContain("common.locked_mail_after_reset");
  });

  it("keeps the plain error for mail that arrived after the reset", async () => {
    const view = await render(true, vi.fn(), AFTER_RESET);

    expect(view.textContent).toContain("common.failed_to_decrypt_email");
    expect(view.textContent).not.toContain("common.locked_mail_after_reset");
    expect(
      find_button(view, "common.locked_data_banner_action"),
    ).toBeUndefined();
  });

  it("keeps the plain error when the message date is unknown", async () => {
    const view = await render(true, vi.fn(), null);

    expect(view.textContent).toContain("common.failed_to_decrypt_email");
    expect(view.textContent).not.toContain("common.locked_mail_after_reset");
  });

  it("keeps the plain error when the reset time is unknown", async () => {
    h.latest_retired_at = null;

    const view = await render(true);

    expect(view.textContent).toContain("common.failed_to_decrypt_email");
    expect(view.textContent).not.toContain("common.locked_mail_after_reset");
  });

  it("keeps the plain error for failures that are not decryption failures", async () => {
    const view = await render(false);

    expect(view.textContent).toContain("common.failed_to_decrypt_email");
    expect(
      find_button(view, "common.locked_data_banner_action"),
    ).toBeUndefined();
  });

  it("reloads the message after a recovery attempt", async () => {
    const on_retry = vi.fn();

    await render(true, on_retry);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LOCKED_DATA_CHANGED_EVENT));
    });

    expect(on_retry).toHaveBeenCalled();
  });
});

describe("is_sealed_before_reset", () => {
  const reset = Date.parse("2026-05-01T12:00:00Z");

  it("counts mail delivered before the reset or within the grace window", () => {
    expect(is_sealed_before_reset("2026-05-01T11:00:00Z", reset)).toBe(true);
    expect(is_sealed_before_reset("2026-05-01T12:05:00Z", reset)).toBe(true);
  });

  it("rejects mail delivered after the grace window", () => {
    expect(is_sealed_before_reset("2026-05-01T12:30:00Z", reset)).toBe(false);
  });

  it("rejects missing or unreadable inputs", () => {
    expect(is_sealed_before_reset(null, reset)).toBe(false);
    expect(is_sealed_before_reset("garbage", reset)).toBe(false);
    expect(is_sealed_before_reset("2026-04-01T00:00:00Z", null)).toBe(false);
  });
});
