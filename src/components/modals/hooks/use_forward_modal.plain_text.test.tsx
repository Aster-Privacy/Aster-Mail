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
import type { UseForwardModalProps } from "./use_forward_modal/helpers";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  send_forward: vi.fn(),
  send_via_external_account: vi.fn(),
  undo_add: vi.fn(),
  store_payload: vi.fn(),
  schedule: vi.fn(),
  sender_state: {
    options: [] as unknown[],
    resolved: null as unknown,
  },
}));

const stable = vi.hoisted(() => ({
  t: (key: string) => key,
  preferences: {
    signature_mode: "off",
    show_aster_branding: false,
    show_badges_in_signature: false,
    undo_send_enabled: true,
    undo_send_seconds: 10,
    undo_send_period: "seconds",
    auto_save_recent_recipients: false,
    signature_placement: "below",
  },
  auth: {
    user: { email: "me@astermail.org", username: "me", display_name: "Me" },
    vault: { key: "vault" },
  },
  signatures: {
    default_signature: null,
    get_formatted_signature: () => "",
    is_loading: false,
    signatures: [],
  },
  ghost: { is_ghost_enabled: false },
  editor_change: { current: (_html: string) => undefined as void },
  editor: {
    format_state: { active_formats: new Set<string>() },
    is_mac: false,
    exec_format: () => undefined,
    insert_text: () => undefined,
  },
}));

vi.mock("@/services/mail_actions", () => ({
  send_forward: mocks.send_forward,
}));

vi.mock("@/services/api/external_accounts", () => ({
  send_via_external_account: mocks.send_via_external_account,
}));

vi.mock("@/hooks/use_undo_send", () => ({
  undo_send_manager: { add: mocks.undo_add },
  store_pending_send_payload: mocks.store_payload,
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: () => 10_000,
}));

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_email_sent: vi.fn(),
  emit_thread_reply_optimistic: vi.fn(),
  emit_thread_reply_sent: vi.fn(),
  emit_thread_reply_cancelled: vi.fn(),
  emit_scheduled_changed: vi.fn(),
}));

vi.mock("@/hooks/use_draggable_modal", () => ({
  use_draggable_modal: () => ({
    handle_drag_start: () => undefined,
    get_position_style: () => ({}),
  }),
}));

vi.mock("@/hooks/use_editor", () => ({
  use_editor: (options: { on_change: (html: string) => void }) => {
    stable.editor_change.current = options.on_change;

    return stable.editor;
  },
}));

vi.mock("@/contexts/auth_context", () => ({ use_auth: () => stable.auth }));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: stable.preferences }),
}));

vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => stable.signatures,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: stable.t }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({
    sender_options: mocks.sender_state.options,
    loading: false,
  }),
}));

vi.mock("@/hooks/use_ghost_mode", () => ({
  use_ghost_mode: () => stable.ghost,
}));

vi.mock("@/hooks/use_ghost_sender_binding", () => ({
  use_ghost_sender_binding: (
    _ghost: unknown,
    _sender: unknown,
    set_sender: (sender: unknown) => void,
  ) => set_sender,
}));

vi.mock("@/lib/preferred_sender", () => ({
  get_preferred_sender_id: () => null,
  set_preferred_sender_id: () => undefined,
  subscribe_preferred_sender: () => () => undefined,
}));

vi.mock("@/hooks/use_preferred_sender_ready", () => ({
  use_preferred_sender_ready: () => true,
}));

vi.mock("@/components/compose/resolve_from_sender", () => ({
  resolve_from_sender: () => mocks.sender_state.resolved,
}));

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_html: (html: string) => ({ html }),
  sanitize_outgoing_html: (html: string) => html,
  repair_comment_markup: (html: string) => html,
}));

vi.mock("@/lib/forward_css_inliner", () => ({
  inline_email_css: (html: string) => html,
}));

vi.mock("@/hooks/use_plan_limits", () => {
  const plan = { limits: null, is_feature_locked: () => false };

  return { use_plan_limits: () => plan };
});

vi.mock("@/services/api/user", () => ({
  fetch_my_badges: () => Promise.resolve({ data: [] }),
}));

vi.mock("@/stores/my_badge_prefs_store", () => ({
  use_my_badge_prefs: () => null,
}));

vi.mock("@/components/compose/compose_draft_helpers", () => ({
  attachments_to_draft_data: () => [],
  build_badge_html: () => "",
  draft_data_to_attachments: () => [],
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => undefined,
}));

vi.mock("@/components/compose/compose_shared", async (import_original) => ({
  ...(await import_original<
    typeof import("@/components/compose/compose_shared")
  >()),
  get_aster_footer: () => "",
}));

vi.mock("@/components/compose/send_lock", () => ({
  SEND_LOCK_STALL_MS: 60_000,
  can_acquire_send_lock: (lock: { held: boolean }) => !lock.held,
  is_repeat_send: () => false,
  build_send_fingerprint: () => "fingerprint",
  is_duplicate_send: () => false,
  record_send: () => undefined,
  forget_send: () => undefined,
}));

vi.mock("@/services/contacts_auto_save", () => ({
  auto_save_recipients_to_contacts: () => Promise.resolve(),
}));

vi.mock("@/services/api/scheduled", () => ({
  create_scheduled_email: mocks.schedule,
}));

vi.mock("@/services/attachment_limits", () => ({
  MAX_ATTACHMENTS_PER_SEND: 20,
  ensure_attachment_limits: () => Promise.resolve(),
  get_max_attachment_size: () => 1,
  get_max_total_attachments_size: () => 1,
}));

vi.mock("@/services/attachment_rejection", () => ({
  describe_oversized_file: () => ({ message: "" }),
  describe_too_many_attachments: () => "",
  describe_would_exceed_total: () => "",
  prompt_attachment_upgrade: () => undefined,
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  prepare_external_attachments: () => [],
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: () => undefined }));

vi.mock("@/services/api/attachments", () => ({
  list_attachments: () => Promise.resolve({ data: [] }),
}));
vi.mock("@/services/forward_store", () => ({
  get_forward_mail_id: () => null,
  clear_forward_mail_id: vi.fn(),
}));
const { use_forward_modal } = await import("./use_forward_modal/hook");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let latest: ReturnType<typeof use_forward_modal>;
let root: Root;
let container: HTMLDivElement;
function Harness(props: UseForwardModalProps) {
  latest = use_forward_modal(props);
  return <div ref={latest.message_editor_ref} />;
}
async function setup(text: string, plain = true) {
  await act(async () => {
    root.render(
      <Harness
        is_open
        on_close={vi.fn()}
        sender_name="Sam"
        sender_email="sam@example.com"
        email_subject="Plans"
        email_body="<p>Original message</p>"
        email_timestamp="2026-09-01T10:00:00Z"
        is_external={false}
      />,
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    latest.dispatch_recipients({
      type: "SET",
      field: "to",
      emails: ["reader@example.com"],
    });
    if (plain) latest.toggle_plain_text_mode();
  });
  await act(async () => {
    stable.editor_change.current(text);
    if (plain) {
      // Supply browser-style innerText, including rendered line breaks.
      Object.defineProperty(latest.message_editor_ref.current!, "innerText", {
        value: text,
        writable: true,
        configurable: true,
      });
    } else latest.message_editor_ref.current!.innerHTML = text;
  });
}
const plain_comment = "Use <project> & check\nThen restart.";
const html_comment = "Use &lt;project&gt; &amp; check<br>Then restart.";
describe("forward comment send formatting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.sender_state.options = [];
    mocks.sender_state.resolved = null;
    mocks.send_forward.mockResolvedValue({
      success: true,
      queued_id: "queue_1",
      is_server_queued: true,
    });
    mocks.schedule.mockResolvedValue({ data: {} });
    mocks.send_via_external_account.mockResolvedValue({ data: {} });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
  it("escapes plain text and preserves line breaks for send and undo recovery", async () => {
    await setup(plain_comment);
    await act(async () => {
      await latest.handle_forward();
    });
    expect(mocks.send_forward).toHaveBeenCalledTimes(1);
    expect(mocks.send_forward.mock.calls[0][0].message).toBe(html_comment);
    expect(mocks.store_payload.mock.calls[0][1].body).toContain(
      html_comment + "<br><br>",
    );
    expect(mocks.store_payload.mock.calls[0][1].body).toContain(
      "<p>Original message</p>",
    );
  });
  it("preserves plain text when sending through an external account", async () => {
    const external = {
      id: "external_1",
      email: "me@elsewhere.example",
      type: "external",
      is_enabled: true,
      address_hash: "hash_1",
    };
    mocks.sender_state.options = [external];
    await setup(plain_comment);
    await act(async () =>
      latest.set_selected_sender(
        external as Parameters<typeof latest.set_selected_sender>[0],
      ),
    );
    await act(async () => {
      await latest.handle_forward();
    });
    expect(mocks.send_via_external_account.mock.calls[0][5]).toContain(
      html_comment + "<br><br>",
    );
  });
  it("preserves plain text when scheduling a forward", async () => {
    await setup(plain_comment);
    await act(async () =>
      latest.set_scheduled_time(new Date("2027-01-01T10:00:00Z")),
    );
    await act(async () => {
      await latest.handle_scheduled_send();
    });
    expect(mocks.schedule.mock.calls[0][1].body).toContain(
      html_comment + "<br><br>",
    );
  });
  it("keeps formatted HTML when rich text mode is used", async () => {
    await setup("<b>Meet at 10</b>", false);
    await act(async () => {
      await latest.handle_forward();
    });
    expect(mocks.send_forward.mock.calls[0][0].message).toBe(
      "<b>Meet at 10</b>",
    );
  });
  it("converts existing formatting before sending in plain text mode", async () => {
    await setup("<b>Meet at 10</b>", false);
    await act(async () => latest.toggle_plain_text_mode());
    expect(latest.forward_message).toBe("Meet at 10");
    await act(async () => {
      await latest.handle_forward();
    });
    expect(mocks.send_forward.mock.calls[0][0].message).toBe("Meet at 10");
  });
  it("escapes literal markup when switching plain text back to rich text", async () => {
    await setup(plain_comment);
    await act(async () => latest.toggle_plain_text_mode());
    expect(latest.forward_message).toBe(html_comment);
    expect(
      latest.message_editor_ref.current!.querySelector("project"),
    ).toBeNull();
    await act(async () => {
      await latest.handle_forward();
    });
    expect(mocks.send_forward.mock.calls[0][0].message).toBe(html_comment);
  });
});
