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
import type { Attachment } from "./compose_shared";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save_draft: vi.fn(),
  vault: {},
  preferences: { auto_save_drafts: true, low_network_mode: false },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ vault: mocks.vault }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: mocks.preferences }),
}));
vi.mock("@/services/crypto/encrypted_drafts", () => ({
  draft_manager: {
    save_draft: mocks.save_draft,
    get_context: () => ({ is_deleted: false }),
    await_pending_save: async () => {},
    clear_context: vi.fn(),
    delete_draft: async () => true,
  },
}));
vi.mock("@/services/api/client", () => ({
  api_client: { refresh_session: vi.fn() },
}));
vi.mock("@/services/api/csrf", () => ({ has_csrf_token: () => true }));
vi.mock("@/components/compose/compose_shared", () => ({}));
vi.mock("@/components/compose/compose_draft_helpers", () => ({
  attachments_to_draft_data: () => [],
}));

import {
  use_compose_drafts,
  type UseComposeDraftsReturn,
} from "./use_compose_drafts";

const RECIPIENTS = { to: ["alice@astermail.org"], cc: [], bcc: [] };
const ATTACHMENTS: Attachment[] = [];
const LARGE_IMAGE = `<img src="data:image/png;base64,${"A".repeat(
  Math.ceil((4 * 1024 * 1024 * 4) / 3),
)}">`;

let root: Root;
let hook: UseComposeDraftsReturn;
let message = "";
const attachments_ref = { current: ATTACHMENTS };
const is_sending_ref = { current: false };
const save_timer_ref: {
  current: ReturnType<typeof setTimeout> | null;
} = { current: null };
const draft_context_id_ref: { current: string | null } = { current: null };

function Probe() {
  hook = use_compose_drafts({
    recipients: RECIPIENTS,
    subject: "Trip photos",
    message,
    attachments: ATTACHMENTS,
    attachments_ref,
    on_close: () => {},
    reset_form: () => {},
    is_sending_ref,
    save_timer_ref,
    draft_context_id_ref,
  });

  return null;
}

async function type(next: string) {
  message = next;
  await act(async () => root.render(<Probe />));
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function saved_messages(): string[] {
  return mocks.save_draft.mock.calls.map(
    (call) => (call[1] as { message: string }).message,
  );
}

async function type_in_bursts(body: string, seconds: number) {
  let text = "";

  for (let elapsed = 0; elapsed < seconds * 1000;) {
    for (let key = 0; key < 6; key++) {
      text += "x";
      await type(`${body}<p>${text}</p>`);
      await wait(250);
      elapsed += 250;
    }
    await wait(1500);
    elapsed += 1500;
  }

  return `${body}<p>${text}</p>`;
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mocks.save_draft.mockReset();
  mocks.save_draft.mockResolvedValue({ success: true });
  message = "";
  save_timer_ref.current = null;
  draft_context_id_ref.current = "draft-1";
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("draft autosave with pasted images", () => {
  it("keeps the one second autosave for a plain draft", async () => {
    await type("<p>Hello</p>");
    await wait(1000);

    expect(mocks.save_draft).toHaveBeenCalledTimes(1);
  });

  it("waits the heavy draft delay once a large image is pasted", async () => {
    await type(`<p>Hello</p>${LARGE_IMAGE}`);
    await wait(19_000);

    expect(mocks.save_draft).not.toHaveBeenCalled();

    await wait(1000);

    expect(mocks.save_draft).toHaveBeenCalledTimes(1);
  });

  it("saves a draft with a large image once typing pauses for the heavy delay", async () => {
    const latest = await type_in_bursts(LARGE_IMAGE, 60);

    await wait(20_000);

    expect(saved_messages()).toEqual([latest]);
  });

  it("saves a plain draft after every pause in typing", async () => {
    await type_in_bursts("", 60);

    expect(mocks.save_draft.mock.calls.length).toBeGreaterThanOrEqual(15);
  });

  it("returns to the short delay when the image is removed", async () => {
    await type(`<p>Hello</p>${LARGE_IMAGE}`);
    await wait(500);
    await type("<p>Hello</p>");
    await wait(1000);

    expect(saved_messages()).toEqual(["<p>Hello</p>"]);
  });

  it("still saves the latest text right away when the compose closes", async () => {
    const latest = await type_in_bursts(LARGE_IMAGE, 5);

    expect(mocks.save_draft).not.toHaveBeenCalled();

    await act(async () => hook.handle_close());

    expect(saved_messages()).toEqual([latest]);
  });

  it("still saves the latest text when the page is hidden", async () => {
    await type(`<p>Hello</p>${LARGE_IMAGE}`);
    await wait(2000);
    window.dispatchEvent(new Event("pagehide"));

    expect(saved_messages()).toEqual([`<p>Hello</p>${LARGE_IMAGE}`]);
  });
});
