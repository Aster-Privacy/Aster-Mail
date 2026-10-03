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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";

const h = vi.hoisted(() => ({
  track_subscription: vi.fn(async (_params: Record<string, unknown>) => ({})),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { undo_send_enabled: false } }),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/utils/open_link", () => ({
  open_external: vi.fn(),
}));

vi.mock("@/services/api/subscriptions", () => ({
  track_subscription: h.track_subscription,
  proxy_unsubscribe: vi.fn(),
}));

vi.mock("@/components/modals/unsubscribe_confirmation_modal", () => ({
  confirm_unsubscribe: vi.fn(async () => false),
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  persist_unsubscribe: vi.fn(),
  use_unsubscribed_senders: () => ({
    is_unsubscribed: () => false,
    mark_unsubscribed: vi.fn(),
  }),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: () => 0,
}));

const { UnsubscribeBanner } = await import("./unsubscribe_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const BODY =
  '<p>Hi</p><a href="https://sender.example/u/secret-token">Unsubscribe</a>';

function render_and_capture(html: string, list_unsubscribe?: string) {
  const info = detect_unsubscribe_info(html, "", { list_unsubscribe });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <UnsubscribeBanner
        sender_email="news@sender.example"
        sender_name="News"
        unsubscribe_info={info}
      />,
    );
  });

  expect(h.track_subscription).toHaveBeenCalledTimes(1);

  return h.track_subscription.mock.calls[0][0];
}

describe("UnsubscribeBanner passive tracking", () => {
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    h.track_subscription.mockClear();
  });

  it("never sends a link taken from the message body", () => {
    const payload = render_and_capture(BODY);

    expect(payload.unsubscribe_link).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("secret-token");
  });

  it("does not send the body link when the header has only mailto", () => {
    const payload = render_and_capture(BODY, "<mailto:u@sender.example>");

    expect(JSON.stringify(payload)).not.toContain("secret-token");
  });

  it("still sends a link that came from the List-Unsubscribe header", () => {
    const payload = render_and_capture(
      BODY,
      "<https://sender.example/header-unsub>",
    );

    expect(payload.unsubscribe_link).toBe(
      "https://sender.example/header-unsub",
    );
  });
});

describe("header_unsubscribe_link", async () => {
  const { header_unsubscribe_link } =
    await import("@/utils/unsubscribe_detector");

  it("rejects a link missing from the header", () => {
    expect(
      header_unsubscribe_link({
        unsubscribe_link: "https://a.example/body",
        list_unsubscribe_header: "<https://a.example/header>",
      }),
    ).toBeUndefined();
  });

  it("rejects a link that only appears as a substring of a header link", () => {
    expect(
      header_unsubscribe_link({
        unsubscribe_link: "https://a.example/h",
        list_unsubscribe_header: "<https://a.example/header>",
      }),
    ).toBeUndefined();
  });

  it("rejects a link when there is no header", () => {
    expect(
      header_unsubscribe_link({ unsubscribe_link: "https://a.example/x" }),
    ).toBeUndefined();
  });
});
