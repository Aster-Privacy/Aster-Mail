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
  preferences: {} as Record<string, unknown>,
  send_messages: [] as string[],
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) =>
      key === "common.secured_by_aster_mail" ? "Secured by" : key,
  }),
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
    save_draft: vi.fn(async () => ({ success: true, id: "draft-1" })),
  },
}));
vi.mock("@/components/compose/use_compose_send", () => ({
  use_compose_send: (options: { message: string }) => {
    mocks.send_messages.push(options.message);

    return {
      handle_send: vi.fn(),
      handle_scheduled_send: vi.fn(),
      is_sending: false,
      pgp_enabled: false,
      pgp_override: null,
      toggle_pgp: vi.fn(),
      queued_email_id: null,
      set_queued_email_id: vi.fn(),
    };
  },
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

import type { EditDraftData } from "@/components/compose/compose_shared";

let root: Root;
let hook: UseComposeReturn;
let editor_el: HTMLDivElement | null = null;

function Probe({ edit_draft }: { edit_draft?: EditDraftData }) {
  hook = use_compose({
    on_close: () => {},
    edit_draft,
    session_storage_key: "compose-branding-off",
  });

  return (
    <div
      ref={(el) => {
        editor_el = el;
        (
          hook.message_textarea_ref as { current: HTMLDivElement | null }
        ).current = el;
      }}
      contentEditable
    />
  );
}

async function render_probe(edit_draft?: EditDraftData) {
  await act(async () => root.render(<Probe edit_draft={edit_draft} />));
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
  }
}

function set_preferences(overrides: Record<string, unknown>) {
  mocks.preferences = { ...mocks.preferences, ...overrides };
}

function last_send_message(): string {
  return mocks.send_messages[mocks.send_messages.length - 1] ?? "";
}

function saved_draft(body: string): EditDraftData {
  return {
    id: "draft-9",
    version: 1,
    draft_type: "new",
    to_recipients: ["alice@example.com"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "Plans",
    message: body,
    updated_at: new Date(0).toISOString(),
  } as unknown as EditDraftData;
}

const FOOTER_HTML =
  '<br><br>Secured by <a href="https://astermail.org" target="_blank" rel="noopener noreferrer">Aster Mail</a>';

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  editor_el = null;
  mocks.send_messages = [];
  mocks.preferences = {
    auto_save_drafts: true,
    compose_mode: "rich_text",
    signature_mode: "auto",
    show_badges_in_signature: false,
    show_aster_branding: false,
    low_network_mode: false,
  };
  root = createRoot(document.createElement("div"));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

describe("compose with the watermark turned off", () => {
  it("adds no watermark to a new message", async () => {
    await render_probe();

    expect(editor_el!.innerHTML).not.toContain("astermail.org");
    expect(last_send_message()).not.toContain("astermail.org");
  });

  it("removes the watermark when the saved setting arrives after the window opens", async () => {
    set_preferences({ show_aster_branding: true });
    await render_probe();

    expect(editor_el!.innerHTML).toContain("astermail.org");

    set_preferences({ show_aster_branding: false });
    await render_probe();

    expect(editor_el!.innerHTML).not.toContain("astermail.org");
    expect(editor_el!.textContent).not.toContain("Secured by");
    expect(last_send_message()).not.toContain("astermail.org");
  });

  it("does not send the watermark kept in an older draft", async () => {
    await render_probe(saved_draft(`<div>See you at noon</div>${FOOTER_HTML}`));

    const outgoing = last_send_message();

    expect(outgoing).toContain("See you at noon");
    expect(outgoing).not.toContain("astermail.org");
    expect(outgoing).not.toContain("Secured by");
  });

  it("keeps the watermark inside a quoted message", async () => {
    const quoted = `<div>Thanks</div><div class="aster_quote"><blockquote>Old note${FOOTER_HTML}</blockquote></div>`;

    await render_probe(saved_draft(quoted));

    expect(last_send_message()).toContain("astermail.org");
  });

  it("keeps the watermark when the setting is on", async () => {
    set_preferences({ show_aster_branding: true });
    await render_probe();

    expect(last_send_message()).toContain("astermail.org");
  });
});
