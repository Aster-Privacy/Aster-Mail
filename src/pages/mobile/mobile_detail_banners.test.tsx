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

const persist_unsubscribe = vi.fn();
const show_action_toast = vi.fn();
const request_external_link = vi.fn(async (_url: string) => false);
const open_external = vi.fn();
let lockdown = false;

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      undo_send_enabled: false,
      undo_send_seconds: 0,
      undo_send_period: "seconds",
    },
  }),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: () => 0,
}));

vi.mock("@/hooks/use_unsubscribed_senders", () => ({
  persist_unsubscribe: (...args: unknown[]) => persist_unsubscribe(...args),
  use_unsubscribed_senders: () => ({ is_unsubscribed: () => false }),
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: (options: unknown) => show_action_toast(options),
}));

vi.mock("@/services/lockdown_store", async (import_original) => ({
  ...(await import_original<typeof import("@/services/lockdown_store")>()),
  is_any_lockdown_active: () => lockdown,
}));

const execute_unsubscribe = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => "manual"),
);

vi.mock("@/utils/unsubscribe_detector", () => ({
  execute_unsubscribe,
  get_sender_domain: () => "news.example.com",
  get_manual_unsubscribe_url: () => "https://news.example.com/unsubscribe",
}));

vi.mock("@/utils/external_link_request", () => ({
  request_external_link: (url: string) => request_external_link(url),
}));

vi.mock("@/utils/open_link", () => ({
  open_external: (...args: unknown[]) => open_external(...args),
}));

const { MobileUnsubscribeBanner } = await import("./mobile_detail_banners");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const EMAIL = {
  sender_email: "news@news.example.com",
  sender: "News",
  unsubscribe_info: {
    has_unsubscribe: true,
    unsubscribe_link: "https://news.example.com/unsubscribe",
    method: "link",
  },
};

async function render_and_unsubscribe(): Promise<{
  on_undo?: () => Promise<void>;
  action_label?: string;
}> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MobileUnsubscribeBanner
        delivery={{ routing_token: "token-alias" }}
        email={EMAIL}
        t={(key) => key}
      />,
    );
  });

  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "mail.unsubscribe",
  );

  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  return show_action_toast.mock.calls.at(-1)?.[0] ?? {};
}

beforeEach(() => {
  lockdown = false;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("MobileUnsubscribeBanner", () => {
  it("passes the address the message was delivered to", async () => {
    await render_and_unsubscribe();

    expect(execute_unsubscribe).toHaveBeenCalledWith(expect.anything(), {
      routing_token: "token-alias",
    });
  });

  it("opens the manual unsubscribe page through the external link check", async () => {
    const toast = await render_and_unsubscribe();

    expect(toast.action_label).toBe("mail.open_unsubscribe_page");

    await toast.on_undo!();

    expect(request_external_link).toHaveBeenCalledWith(
      "https://news.example.com/unsubscribe",
    );
    expect(open_external).not.toHaveBeenCalled();
    expect(persist_unsubscribe).not.toHaveBeenCalled();

    request_external_link.mockResolvedValueOnce(true);
    await toast.on_undo!();

    expect(persist_unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("offers no unsubscribe page during lockdown", async () => {
    lockdown = true;

    const toast = await render_and_unsubscribe();

    expect(toast.action_label).toBeUndefined();
    expect(toast.on_undo).toBeUndefined();
  });
});
