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
import type { InboxEmail } from "@/types/email";
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { AliasDeliveryIndex } from "@/hooks/use_sidebar_aliases";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";

const alias_store = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  index: null as AliasDeliveryIndex | null,
  preferences: {} as { show_alias_indicators?: boolean },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: { address?: string }) =>
      params?.address ? `${key}:${params.address}` : key,
  }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: alias_store.preferences }),
}));

vi.mock("@/hooks/use_peer_profile", () => ({
  use_peer_profile: () => null,
}));

vi.mock("@/hooks/use_sidebar_aliases", async (import_original) => {
  const actual =
    await import_original<typeof import("@/hooks/use_sidebar_aliases")>();

  alias_store.index = actual.build_alias_delivery_index([], []);

  return {
    build_alias_delivery_index: actual.build_alias_delivery_index,
    subscribe_aliases: (cb: () => void) => {
      alias_store.listeners.add(cb);

      return () => {
        alias_store.listeners.delete(cb);
      };
    },
    get_alias_hash_by_address: (address: string) =>
      alias_store.index!.hash_by_address.get(address.trim().toLowerCase()) ??
      null,
    resolve_alias_delivery: (
      routing_token: string | undefined,
      addresses: string[],
    ) =>
      actual.resolve_alias_delivery_in(
        alias_store.index!,
        routing_token,
        addresses,
      ),
  };
});

vi.mock("@/components/ui/profile_avatar", () => ({
  ProfileAvatar: () => <span />,
}));

vi.mock("@/components/email/official_badge", () => ({
  OfficialBadge: () => null,
}));

vi.mock("@/components/ui/badge_chip", () => ({
  BadgeChip: () => null,
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Tooltip: ({ children }: { children?: unknown }) => <>{children as never}</>,
  Checkbox: () => <span />,
}));

const { InboxEmailListItem } =
  await import("@/components/email/inbox_email_list_item/item");
const { build_alias_delivery_index } =
  await import("@/hooks/use_sidebar_aliases");
const { add_pending_thread_reply, reset_pending_thread_replies } =
  await import("@/hooks/pending_thread_replies");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROW_COUNT = 50;

const emails = Array.from(
  { length: ROW_COUNT },
  (_, i) =>
    ({
      id: `email-${i}`,
      item_type: "received",
      sender_name: `Sender ${i}`,
      sender_email: `sender${i}@example.com`,
      subject: `Subject ${i}`,
      preview: "preview",
      timestamp: "10:00",
      is_read: false,
      is_selected: false,
      thread_token: `thread-${i}`,
      thread_message_count: 1,
      routing_token: `route-${i}`,
      recipient_addresses: [`box${i}@example.org`],
    }) as unknown as InboxEmail,
);

function alias(
  local_part: string,
  domain: string,
  hash: string,
): DecryptedEmailAlias {
  return {
    id: `alias-${local_part}`,
    local_part,
    domain,
    full_address: `${local_part}@${domain}`,
    alias_address_hash: hash,
    is_enabled: true,
    is_random: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as DecryptedEmailAlias;
}

function set_aliases(aliases: DecryptedEmailAlias[]): void {
  act(() => {
    alias_store.index = build_alias_delivery_index(aliases, []);
    alias_store.listeners.forEach((cb) => cb());
  });
}

const renders = new Map<string, number>();
const noop = () => {};

function count_render(id: string): void {
  renders.set(id, (renders.get(id) ?? 0) + 1);
}

function total_renders(): number {
  let total = 0;

  renders.forEach((n) => (total += n));

  return total;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render_list(): void {
  act(() => {
    root!.render(
      <>
        {emails.map((email) => (
          <Profiler key={email.id} id={email.id} onRender={count_render}>
            <InboxEmailListItem
              current_view="inbox"
              density="comfortable"
              email={email}
              on_email_click={noop}
              on_toggle_select={noop}
              show_email_preview={true}
              show_profile_pictures={true}
            />
          </Profiler>
        ))}
      </>,
    );
  });
  renders.clear();
}

function row_text(index: number): string {
  return container!.children[index]?.textContent ?? "";
}

function row_alias_label(index: number): string | null {
  return (
    container!.children[index]
      ?.querySelector('[aria-label^="mail.received_via_alias"]')
      ?.getAttribute("aria-label") ?? null
  );
}

beforeEach(() => {
  alias_store.preferences = {};
  alias_store.index = build_alias_delivery_index([], []);
  alias_store.listeners.clear();
  reset_pending_thread_replies();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  render_list();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  reset_pending_thread_replies();
});

describe("InboxEmailListItem store subscriptions on a 50-row list", () => {
  it("registers one alias listener per row", () => {
    expect(alias_store.listeners.size).toBe(ROW_COUNT);
  });

  it("does not re-render rows when an alias change touches none of them", () => {
    set_aliases([alias("unrelated", "example.net", "hash-unrelated")]);

    expect(total_renders()).toBe(0);
  });

  it("re-renders only the row whose alias indicator changes", () => {
    set_aliases([alias("box7", "example.org", "hash-box7")]);

    expect(total_renders()).toBe(1);
    expect(renders.get("email-7")).toBe(1);
    expect(row_alias_label(7)).toBe("mail.received_via_alias:box7@example.org");
    expect(row_text(7)).toContain("example.org");
    expect(row_alias_label(8)).toBeNull();

    renders.clear();
    set_aliases([
      alias("box7", "example.org", "hash-box7"),
      alias("unrelated", "example.net", "hash-unrelated"),
    ]);

    expect(total_renders()).toBe(0);

    set_aliases([]);

    expect(total_renders()).toBe(1);
    expect(row_alias_label(7)).toBeNull();
    expect(row_text(7)).not.toContain("example.org");
  });

  it("hides the alias indicator but keeps the domain chip when indicators are off", () => {
    set_aliases([alias("box7", "example.org", "hash-box7")]);
    expect(row_alias_label(7)).toBe("mail.received_via_alias:box7@example.org");

    alias_store.preferences = { show_alias_indicators: false };
    act(() => {
      root?.unmount();
    });
    root = createRoot(container!);
    render_list();

    expect(row_alias_label(7)).toBeNull();
    expect(row_text(7)).toContain("example.org");
  });

  it("re-renders only the row whose thread gets a pending reply", () => {
    act(() => {
      add_pending_thread_reply("thread-3", "optimistic-1");
    });

    expect(total_renders()).toBe(1);
    expect(renders.get("email-3")).toBe(1);
    expect(row_text(3)).toContain("2");

    renders.clear();
    act(() => {
      add_pending_thread_reply("thread-unknown", "optimistic-2");
    });

    expect(total_renders()).toBe(0);
  });
});
