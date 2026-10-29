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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preferences: {
    auto_save_drafts: true,
    compose_mode: "rich_text",
    signature_mode: "off",
    show_badges_in_signature: false,
    show_aster_branding: false,
    low_network_mode: false,
  } as Record<string, unknown>,
  save_draft: vi.fn(),
  sent: [] as string[],
  scheduled: [] as string[],
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: mocks.preferences }),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "me@astermail.org" }, vault: {} }),
}));
vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => ({
    default_signature: null,
    get_formatted_signature: () => "",
    resolve_signature: () => null,
  }),
}));
vi.mock("@/stores/my_badge_prefs_store", () => ({
  use_my_badge_prefs: () => null,
}));
vi.mock("@/services/api/user", () => ({
  fetch_my_badges: async () => ({ data: [] }),
}));
vi.mock("@/hooks/use_suggestion_contacts", () => ({
  use_suggestion_contacts: () => [],
}));
vi.mock("@/services/api/recent_recipients", () => ({
  list_recent_recipients: async () => ({ data: null }),
  decrypt_recent_recipients: async () => [],
}));
vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: [], loading: false }),
  is_signature_bindable_sender_type: () => false,
}));
vi.mock("@/hooks/use_preferred_sender_ready", () => ({
  use_preferred_sender_ready: () => true,
}));
vi.mock("@/hooks/use_ghost_mode", () => ({
  use_ghost_mode: () => ({ is_ghost_enabled: false }),
}));
vi.mock("@/hooks/use_ghost_sender_binding", () => ({
  use_ghost_sender_binding: () => vi.fn(),
}));
vi.mock("@/services/recipient_classification", () => ({
  begin_recipient_classification_session: vi.fn(),
  is_internal_recipient: () => true,
  use_recipient_classification: vi.fn(),
}));
vi.mock("@/services/crypto/encrypted_drafts", () => ({
  draft_manager: {
    load_context: () => "context-1",
    create_context: () => "context-1",
    set_context_owner: () => undefined,
    clear_context: vi.fn(),
    get_context: () => null,
    await_pending_save: async () => {},
    delete_draft: async () => {},
    save_draft: mocks.save_draft,
  },
}));
vi.mock("@/components/compose/use_compose_send", () => ({
  use_compose_send: ({ message }: { message: string }) => ({
    handle_send: async () => {
      mocks.sent.push(message);
    },
    handle_scheduled_send: async () => {
      mocks.scheduled.push(message);
    },
    is_sending: false,
    pgp_enabled: false,
    pgp_override: null,
    toggle_pgp: vi.fn(),
    queued_email_id: null,
    set_queued_email_id: vi.fn(),
  }),
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: {}, is_feature_locked: () => false }),
}));
vi.mock("@/services/forward_attachments", () => ({
  load_forward_attachments: async () => [],
}));
vi.mock("@/services/api/csrf", () => ({ has_csrf_token: () => true }));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

import { use_compose, type UseComposeReturn } from "./use_compose";
import { ComposeEditor } from "./compose_attachments";

let root: Root;
let hook: UseComposeReturn;
let renders = 0;

function Probe({ show_editor = true }: { show_editor?: boolean }) {
  renders += 1;
  hook = use_compose({
    on_close: () => {},
    session_storage_key: "compose-coalesced-input",
    enable_ctrl_enter_send: true,
  });

  return show_editor ? <ComposeEditor compose={hook} /> : null;
}

function editor(): HTMLDivElement {
  return hook.message_textarea_ref.current!;
}

async function type(text: string) {
  await act(async () => {
    editor().innerHTML = `<div>${text}</div>`;
    editor().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function type_burst(text: string) {
  for (let i = 1; i <= text.length; i++) {
    await type(text.slice(0, i));
  }
}

async function open() {
  await act(async () => root.render(<Probe />));
  await act(async () => {
    vi.advanceTimersByTime(10);
  });
  await act(async () => hook.add_recipient("to", "alice@example.com"));
}

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mocks.save_draft.mockReset();
  mocks.save_draft.mockResolvedValue({ success: true, id: "draft-1" });
  mocks.sent = [];
  mocks.scheduled = [];
  renders = 0;
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("typing in the compose editor", () => {
  it("does not re-render the compose window on every keystroke", async () => {
    await open();
    const before = renders;

    await type_burst("Hello there, how are you");

    expect(renders - before).toBeLessThanOrEqual(1);

    await settle();

    expect(hook.message).toBe("<div>Hello there, how are you</div>");
  });

  it("sends the last keystroke when ctrl+enter follows at once", async () => {
    await open();
    await type_burst("Hello");
    await act(async () => {
      editor().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });

    expect(mocks.sent).toEqual(["<div>Hello</div>"]);
  });

  it("sends the last keystroke when the send button follows at once", async () => {
    await open();
    await type_burst("Hi");
    await act(async () => {
      await hook.handle_send();
    });

    expect(mocks.sent).toEqual(["<div>Hi</div>"]);
  });

  it("schedules the last keystroke", async () => {
    await open();
    await act(async () => hook.set_scheduled_time(new Date(Date.now() + 1e6)));
    await type_burst("Later");
    await act(async () => {
      await hook.handle_scheduled_send();
    });

    expect(mocks.scheduled).toEqual(["<div>Later</div>"]);
  });

  it("keeps the last keystroke in the draft saved on close", async () => {
    await open();
    await type_burst("Draft text");
    await act(async () => hook.handle_close());

    expect(mocks.save_draft.mock.calls.at(-1)?.[1].message).toBe(
      "<div>Draft text</div>",
    );
  });

  it("keeps the last keystroke in the draft saved when the page hides", async () => {
    await open();
    await type_burst("Leaving");
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(mocks.save_draft.mock.calls.at(-1)?.[1].message).toBe(
      "<div>Leaving</div>",
    );
  });

  it("keeps the last keystroke when the editor loses focus", async () => {
    await open();
    await type_burst("Blurred");
    await act(async () => {
      editor().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(hook.message).toBe("<div>Blurred</div>");
  });

  it("does not bring back text the user just deleted", async () => {
    await open();
    await type("Hello");
    await settle();
    await act(async () => {
      editor().innerHTML = "";
      editor().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => hook.set_subject("Re-render"));

    expect(editor().innerHTML).toBe("");

    await settle();

    expect(hook.message).toBe("");
    expect(editor().innerHTML).toBe("");
  });

  it("sends the last keystroke when send waits on an async gate first", async () => {
    await open();
    const stale = hook;

    await type_burst("Gated");
    let sending: Promise<void> = Promise.resolve();

    await act(async () => {
      const gate = new Promise((resolve) => setTimeout(resolve, 500));

      sending = gate.then(() => stale.handle_send());
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
      await sending;
    });

    expect(mocks.sent).toEqual(["<div>Gated</div>"]);
  });

  it("keeps the last keystroke in the draft when the window unmounts", async () => {
    await open();
    await type_burst("Unmounted");
    await act(async () => root.unmount());
    root = createRoot(document.createElement("div"));

    expect(mocks.save_draft.mock.calls.at(-1)?.[1].message).toBe(
      "<div>Unmounted</div>",
    );
  });

  it("restores the latest text after minimising and reopening", async () => {
    await open();
    await type("Hello");
    await settle();
    await type("Hello world");
    await act(async () => root.render(<Probe show_editor={false} />));
    await act(async () => root.render(<Probe show_editor />));

    expect(editor().innerHTML).toBe("<div>Hello world</div>");
    expect(hook.message).toBe("<div>Hello world</div>");
  });

  it("does not let a detached editor block the restore after reopening", async () => {
    await open();
    await type("Hello");
    await settle();
    await act(async () => {
      editor().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => root.render(<Probe show_editor={false} />));
    await act(async () => root.render(<Probe show_editor />));

    expect(editor().innerHTML).toBe("<div>Hello</div>");
  });
});
