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
import type { DecryptedEmail } from "@/components/email/use_email_viewer";
import type { ExtractedPurchaseDetails } from "@/services/extraction/types";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

const probe = vi.hoisted(() => ({
  readable_calls: 0,
  throw_on_read: false,
}));

vi.mock("@/lib/html_sanitizer", async (import_original) => {
  const actual = await import_original<typeof import("@/lib/html_sanitizer")>();

  return {
    ...actual,
    html_to_readable_plain_text: (
      ...args: Parameters<typeof actual.html_to_readable_plain_text>
    ): string => {
      probe.readable_calls += 1;
      if (probe.throw_on_read) throw new Error("parse failed");

      return actual.html_to_readable_plain_text(...args);
    },
  };
});

vi.mock("@/components/email/thread_message_block", async () => {
  const { forwardRef } = await import("react");

  return {
    ThreadMessagesList: forwardRef(function ThreadMessagesList() {
      return <div data-testid="thread-list" />;
    }),
  };
});

vi.mock("@/components/email/sending_message_block", () => ({
  SendingMessageBlock: () => null,
}));

vi.mock("@/components/email/thread_draft_badge", () => ({
  ThreadDraftBadge: () => null,
}));

vi.mock("@/components/email/banners/calendar_invite_banner", () => ({
  CalendarInviteBanner: () => null,
}));

vi.mock("@/components/email/banners/send_failure_banner", () => ({
  SendFailureBanner: () => null,
}));

vi.mock("@/components/email/banners/shipping_details_banner", () => ({
  ShippingDetailsBanner: () => <div data-testid="shipping-banner" />,
}));

vi.mock("@/components/email/banners/purchase_details_banner", () => ({
  PurchaseDetailsBanner: (props: {
    details: ExtractedPurchaseDetails;
    email_id: string;
  }) => (
    <div
      data-email-id={props.email_id}
      data-order-id={props.details.order_id ?? ""}
      data-testid="purchase-banner"
    />
  ),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      default_reply_behavior: "reply",
      force_dark_mode_emails: false,
    },
  }),
}));

const { ViewerThreadContent } = await import("./thread_content");
const { extract_email_details } =
  await import("@/services/extraction/extractor");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RECEIPT_SUBJECT = "Your receipt from Aster Privacy";

function receipt_html(order: string): string {
  return `<html><body><table><tr><td><p>Thank you for your order.</p><p>Order #${order}.</p><p>Total: $86.99.</p></td></tr></table></body></html>`;
}

function make_email(
  id: string,
  fields: { body?: string; html_content?: string } = {},
): DecryptedEmail {
  return {
    id,
    subject: RECEIPT_SUBJECT,
    sender: "Aster Privacy",
    sender_email: "billing@example.com",
    body: fields.body ?? "",
    html_content: fields.html_content,
  } as unknown as DecryptedEmail;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  probe.readable_calls = 0;
  probe.throw_on_read = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

function render_content(email: DecryptedEmail): void {
  const noop = () => {};

  act(() => {
    root!.render(
      <ViewerThreadContent
        current_user_email="alex@example.com"
        email={email}
        on_archive={noop}
        on_forward={noop}
        on_not_spam={noop}
        on_print={noop}
        on_reply={noop}
        on_reply_all={noop}
        on_report_phishing={noop}
        on_toggle_message_read={noop}
        on_trash={noop}
        on_view_source={noop}
        thread_list_ref={createRef()}
        thread_messages={[]}
      />,
    );
  });
}

async function flush_scheduled(): Promise<void> {
  await act(async () => {
    vi.runAllTimers();
  });
}

function purchase_banners(): HTMLElement[] {
  return Array.from(
    container!.querySelectorAll<HTMLElement>('[data-testid="purchase-banner"]'),
  );
}

describe("ViewerThreadContent reading the message markup off the first render", () => {
  it("renders the thread before reading an HTML-only receipt", async () => {
    render_content(
      make_email("receipt_1", { html_content: receipt_html("AS-4471") }),
    );

    expect(container!.querySelector('[data-testid="thread-list"]')).not.toBe(
      null,
    );
    expect(probe.readable_calls).toBe(0);
    expect(purchase_banners()).toHaveLength(0);

    await flush_scheduled();

    expect(probe.readable_calls).toBe(1);
    const expected = extract_email_details(
      RECEIPT_SUBJECT,
      "",
      receipt_html("AS-4471"),
      "billing@example.com",
      "Aster Privacy",
    );

    expect(expected.purchase?.order_id).toBe("AS-4471");
    expect(purchase_banners()).toHaveLength(1);
    expect(purchase_banners()[0].dataset.orderId).toBe("AS-4471");
  });

  it("keeps the banner on the first render when the receipt is plain text", () => {
    render_content(
      make_email("receipt_1", {
        body: "Thank you for your order. Order #AS-4471. Total: $86.99.",
        html_content: receipt_html("AS-4471"),
      }),
    );

    expect(probe.readable_calls).toBe(0);
    expect(purchase_banners()).toHaveLength(1);
    expect(purchase_banners()[0].dataset.orderId).toBe("AS-4471");
  });

  it("never shows the previous message's details after switching", async () => {
    render_content(
      make_email("receipt_1", { html_content: receipt_html("AS-4471") }),
    );
    await flush_scheduled();
    expect(purchase_banners()[0].dataset.orderId).toBe("AS-4471");

    render_content(
      make_email("receipt_2", { html_content: receipt_html("AS-5582") }),
    );

    expect(purchase_banners()).toHaveLength(0);

    await flush_scheduled();

    expect(probe.readable_calls).toBe(2);
    expect(purchase_banners()).toHaveLength(1);
    expect(purchase_banners()[0].dataset.orderId).toBe("AS-5582");
    expect(purchase_banners()[0].dataset.emailId).toBe("receipt_2");
  });

  it("drops a pending read when the viewer closes first", async () => {
    render_content(
      make_email("receipt_1", { html_content: receipt_html("AS-4471") }),
    );
    act(() => {
      root!.unmount();
    });
    root = null;

    await flush_scheduled();

    expect(probe.readable_calls).toBe(0);
  });

  it("falls back to no banner when reading the markup throws", async () => {
    probe.throw_on_read = true;
    render_content(
      make_email("receipt_1", { html_content: receipt_html("AS-4471") }),
    );

    await flush_scheduled();

    expect(probe.readable_calls).toBe(1);
    expect(purchase_banners()).toHaveLength(0);
    expect(container!.querySelector('[data-testid="thread-list"]')).not.toBe(
      null,
    );
  });
});
