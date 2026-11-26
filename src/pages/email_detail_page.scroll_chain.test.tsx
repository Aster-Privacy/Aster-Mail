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
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const h = vi.hoisted(() => ({
  detail: {
    t: (key: string) => key,
    preferences: { keyboard_shortcuts_enabled: false },
    email: null,
    email_id: "mail-1",
    mail_item: null,
    thread_messages: [],
    compose_instances: [],
    is_mobile_sidebar_open: false,
  } as Record<string, unknown>,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/components/email/hooks/use_email_detail", () => ({
  use_email_detail: () => h.detail,
}));

vi.mock("@/components/email/use_spam_confirm", () => ({
  use_spam_confirm: () => ({
    request_spam: vi.fn(),
    spam_confirm_dialog: null,
  }),
}));

vi.mock("@/components/toast/use_toast_action_hosts", () => ({
  use_compose_host: () => undefined,
}));

vi.mock("@/components/email/email_detail/use_email_detail_shortcuts", () => ({
  use_email_detail_shortcuts: () => undefined,
}));

vi.mock("@/contexts/sender_logo_context", () => ({
  SenderLogoBoundary: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <nav data-testid="sidebar" />,
}));

vi.mock("@/components/email/email_detail/email_detail_header", () => ({
  EmailDetailHeader: () => <header className="flex-shrink-0" />,
}));

vi.mock("@/components/email/email_detail/email_detail_body", () => ({
  EmailDetailBody: () => (
    <div className="flex-1 overflow-y-auto" data-testid="detail-scroller" />
  ),
}));

vi.mock("@/components/compose/compose_manager", () => ({
  ComposeManager: () => null,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/components/modals/forward_modal", () => ({
  ForwardModal: () => null,
}));

vi.mock("@/components/modals/reply_modal", () => ({
  ReplyModal: () => null,
}));

vi.mock("@/components/modals/view_source_modal", () => ({
  ViewSourceModal: () => null,
}));

vi.mock("@/services/api/blocked_senders", () => ({
  block_sender: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: EmailDetailPage } = await import("./email_detail_page");

const SCROLL_CONTAINER_CLASSES = [
  "overflow-auto",
  "overflow-y-auto",
  "overflow-scroll",
  "overflow-y-scroll",
  "overflow-hidden",
  "overflow-y-hidden",
];

function is_scroll_container(element: Element): boolean {
  return SCROLL_CONTAINER_CLASSES.some((name) =>
    element.classList.contains(name),
  );
}

function unbounded_column_items(scroller: Element): string[] {
  const offenders: string[] = [];
  let node: Element | null = scroller.parentElement;

  while (node && node.parentElement) {
    const parent = node.parentElement;
    const in_column =
      parent.classList.contains("flex") &&
      parent.classList.contains("flex-col");
    const grows = node.classList.contains("flex-1");

    if (
      in_column &&
      grows &&
      !node.classList.contains("min-h-0") &&
      !is_scroll_container(node)
    ) {
      offenders.push(node.className);
    }
    node = parent;
  }

  return offenders;
}

describe("EmailDetailPage scroll chain", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.replaceState(null, "", "/email/mail-1");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it.each([
    ["full page", "/email/mail-1"],
    ["popup window", "/email/mail-1?popup=1"],
  ])(
    "bounds every growing column ancestor of the message scroller (%s)",
    (_label, url) => {
      window.history.replaceState(null, "", url);

      act(() => {
        root.render(<EmailDetailPage />);
      });

      const scroller = container.querySelector(
        "[data-testid='detail-scroller']",
      );

      expect(scroller).not.toBeNull();
      expect(unbounded_column_items(scroller!)).toEqual([]);
    },
  );
});
