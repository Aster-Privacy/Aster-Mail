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
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  preferences: { encrypt_emails: false },
  user: { email: "me@astermail.org" },
  vault: {},
  send: vi.fn(),
  schedule: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => ({ t: mocks.t }) }));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: mocks.preferences }),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: mocks.user, vault: mocks.vault }),
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: {}, is_feature_locked: () => false }),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: mocks.toast }));
vi.mock("@/services/contacts_auto_save", () => ({
  auto_save_recipients_to_contacts: vi.fn(),
}));
vi.mock("@/services/api/contact_history", () => ({
  log_contact_activity: vi.fn(),
}));
vi.mock("@/services/thread_service", () => ({
  get_or_create_thread_token: vi.fn(),
}));
vi.mock("@/services/recipient_classification", () => ({
  classify_recipients: async () => {},
  is_internal_recipient: () => true,
}));
vi.mock("@/services/crypto/encrypted_drafts", () => ({ draft_manager: {} }));
vi.mock("@/services/api/scheduled", () => ({
  create_scheduled_email: mocks.schedule,
}));
vi.mock("@/native/capacitor_bridge", () => ({
  get_network_status: async () => ({ connected: true }),
  is_native_platform: () => false,
}));
vi.mock("@/native/offline_queue", () => ({ enqueue_action: vi.fn() }));
vi.mock("@/services/crypto/envelope", () => ({ array_to_base64: vi.fn() }));
vi.mock("@/components/compose/compose_send_actions", () => ({
  execute_internal_send: mocks.send,
  execute_external_email_send: mocks.send,
  execute_external_account_email_send: mocks.send,
}));
vi.mock("@/services/key_trust_consent", () => ({
  ensure_external_key_trust: async () => true,
}));
vi.mock("@/components/compose/compose_failed_send_draft", () => ({
  save_failed_send_as_draft: vi.fn(),
}));
vi.mock("@/services/post_quantum_consent", () => ({
  ensure_post_quantum_consent: async () => ({ proceed: true }),
}));
vi.mock("@/components/compose/expiry_plan_gate", () => ({
  find_locked_expiry_feature: () => null,
  prompt_expiry_upgrade: vi.fn(),
}));
import {
  use_compose_send,
  type UseComposeSendReturn,
  type UseComposeSendOptions,
} from "./use_compose_send";
import { reset_recent_sends } from "./send_lock";
let root: Root;
let hook: UseComposeSendReturn;
let options: UseComposeSendOptions;
function Probe() {
  hook = use_compose_send(options);
  return null;
}
async function render() {
  await act(async () => root.render(<Probe />));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  reset_recent_sends();
  mocks.send.mockReset();
  mocks.send.mockResolvedValue(true);
  mocks.schedule.mockReset();
  mocks.schedule.mockResolvedValue({ data: { id: "scheduled-1" } });
  mocks.toast.mockClear();
  options = {
    recipients: { to: ["alice@astermail.org"], cc: [], bcc: [] },
    subject: "Report",
    message: "Hello",
    attachments: [],
    contacts: [],
    selected_sender: {
      id: "primary",
      type: "primary",
      email: "me@astermail.org",
      is_enabled: true,
    },
    has_external_recipients: false,
    expires_at: null,
    expiry_password: null,
    scheduled_time: null,
    session_storage_key: "compose-test",
    on_close: vi.fn(),
    reset_form: vi.fn(),
    clear_all_errors: vi.fn(),
    set_is_scheduling: vi.fn(),
    is_sending_ref: { current: false },
    save_timer_ref: { current: null },
    draft_context_id_ref: { current: null },
  };
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

it.each(["cc", "bcc"] as const)(
  "sends mail addressed only through %s",
  async (field) => {
    options.recipients = {
      to: [],
      cc: [],
      bcc: [],
      [field]: ["alice@astermail.org"],
    };
    await render();
    await act(async () => hook.handle_send());
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toMatchObject({
      to: [],
      [field]: ["alice@astermail.org"],
    });
  },
);
it.each(["cc", "bcc"] as const)(
  "schedules mail addressed only through %s",
  async (field) => {
    options.recipients = {
      to: [],
      cc: [],
      bcc: [],
      [field]: ["alice@astermail.org"],
    };
    options.scheduled_time = new Date("2026-10-02T12:00:00Z");
    await render();
    await act(async () => hook.handle_scheduled_send());
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.mock.calls[0][1]).toMatchObject({
      to_recipients: [],
      [field + "_recipients"]: ["alice@astermail.org"],
    });
  },
);
it("does not send or schedule a message with no recipients", async () => {
  options.recipients = { to: [], cc: [], bcc: [] };
  options.scheduled_time = new Date("2026-10-02T12:00:00Z");
  await render();
  await act(async () => {
    await hook.handle_send();
    await hook.handle_scheduled_send();
  });
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.schedule).not.toHaveBeenCalled();
});
