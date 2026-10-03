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
const LARGE_ATTACHMENT: Attachment = {
  id: "att-1",
  name: "report.pdf",
  size: "3 MB",
  size_bytes: 3 * 1024 * 1024,
  mime_type: "application/pdf",
  data: new ArrayBuffer(3 * 1024 * 1024),
};
const LARGE_IMAGE = `<img src="data:image/png;base64,${"A".repeat(
  Math.ceil((4 * 1024 * 1024 * 4) / 3),
)}">`;
const KEYSTROKE_INTERVAL_MS = 3000;
const TYPING_MS = 5 * 60 * 1000;

let root: Root;
let hook: UseComposeDraftsReturn;
let message = "";
let attachments: Attachment[] = [];
const attachments_ref: { current: Attachment[] } = { current: attachments };
const is_sending_ref = { current: false };
const save_timer_ref: {
  current: ReturnType<typeof setTimeout> | null;
} = { current: null };
const draft_context_id_ref: { current: string | null } = { current: null };

function Probe() {
  hook = use_compose_drafts({
    recipients: RECIPIENTS,
    subject: "Quarterly report",
    message,
    attachments,
    attachments_ref,
    on_close: () => {},
    reset_form: () => {},
    is_sending_ref,
    save_timer_ref,
    draft_context_id_ref,
  });

  return null;
}

async function render_draft(body: string, files: Attachment[]) {
  message = body;
  attachments = files;
  attachments_ref.current = files;
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

async function type_steadily(prefix: string, files: Attachment[]) {
  const longest_unsaved = { ms: 0 };
  let oldest_unsaved: number | null = null;
  let saves_seen = 0;
  let text = "";

  const check_saves = (now: number) => {
    if (mocks.save_draft.mock.calls.length > saves_seen) {
      saves_seen = mocks.save_draft.mock.calls.length;
      oldest_unsaved = null;
    }
    if (oldest_unsaved !== null) {
      longest_unsaved.ms = Math.max(longest_unsaved.ms, now - oldest_unsaved);
    }
  };

  for (let elapsed = 0; elapsed < TYPING_MS; elapsed += KEYSTROKE_INTERVAL_MS) {
    text += "x";
    const body = `${prefix}<p>${text}</p>`;

    await render_draft(body, files);
    if (oldest_unsaved === null) oldest_unsaved = elapsed;
    for (let step = 0; step < KEYSTROKE_INTERVAL_MS; step += 1000) {
      await wait(1000);
      check_saves(elapsed + step + 1000);
    }
  }

  return { latest: `${prefix}<p>${text}</p>`, longest_unsaved };
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mocks.save_draft.mockReset();
  mocks.save_draft.mockResolvedValue({ success: true });
  message = "";
  attachments = [];
  attachments_ref.current = attachments;
  save_timer_ref.current = null;
  draft_context_id_ref.current = "draft-1";
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("draft autosave during steady typing", () => {
  it("saves a draft with a large attachment about once a minute", async () => {
    const { latest, longest_unsaved } = await type_steadily("", [
      LARGE_ATTACHMENT,
    ]);

    expect(mocks.save_draft).toHaveBeenCalledTimes(5);
    expect(longest_unsaved.ms).toBeLessThanOrEqual(60_000);
    expect(saved_messages().at(-1)).toBe(latest);
  });

  it("saves a draft with a large pasted image about once a minute", async () => {
    const { latest, longest_unsaved } = await type_steadily(LARGE_IMAGE, []);

    expect(mocks.save_draft).toHaveBeenCalledTimes(5);
    expect(longest_unsaved.ms).toBeLessThanOrEqual(60_000);
    expect(saved_messages().at(-1)).toBe(latest);
  });

  it("keeps saving a plain draft after every keystroke pause", async () => {
    await type_steadily("", []);

    expect(mocks.save_draft).toHaveBeenCalledTimes(
      TYPING_MS / KEYSTROKE_INTERVAL_MS,
    );
  });

  it("waits the full heavy delay again after a deadline save", async () => {
    await render_draft("<p>a</p>", [LARGE_ATTACHMENT]);
    for (let elapsed = 3000; elapsed <= 60_000; elapsed += 3000) {
      await wait(3000);
      await render_draft(`<p>a${elapsed}</p>`, [LARGE_ATTACHMENT]);
    }

    expect(mocks.save_draft).toHaveBeenCalledTimes(1);

    await wait(19_000);

    expect(mocks.save_draft).toHaveBeenCalledTimes(1);

    await wait(1000);

    expect(mocks.save_draft).toHaveBeenCalledTimes(2);
  });

  it("still saves the latest text when the compose closes after a deadline save", async () => {
    await type_steadily("", [LARGE_ATTACHMENT]);
    await render_draft("<p>last words</p>", [LARGE_ATTACHMENT]);
    await act(async () => hook.handle_close());

    expect(saved_messages().at(-1)).toBe("<p>last words</p>");
  });

  it("still saves the latest text when the page is hidden after a deadline save", async () => {
    await type_steadily("", [LARGE_ATTACHMENT]);
    await render_draft("<p>last words</p>", [LARGE_ATTACHMENT]);
    window.dispatchEvent(new Event("pagehide"));

    expect(saved_messages().at(-1)).toBe("<p>last words</p>");
  });
});
