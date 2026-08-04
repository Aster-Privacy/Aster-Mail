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
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const heads = new Map([["promotions", ["head_1"]]]);
let keys_ready = false;
let generation = 1;
const listeners = new Set<() => void>();

vi.mock("@/services/category_index", () => ({
  get_new_head_ids: () => heads,
  get_index_generation: () => generation,
  get_entry_preview: () => undefined,
  get_preview_version: () => 1,
  get_version: () => 1,
  subscribe: () => () => {},
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  are_keys_ready: () => keys_ready,
  on_keys_ready: (callback: () => void) => {
    if (keys_ready) callback();
    listeners.add(callback);

    return () => listeners.delete(callback);
  },
}));

const list_mail_items = vi.fn(async () => ({
  data: {
    items: [
      { id: "head_1", encrypted_envelope: "enc", envelope_nonce: "nonce" },
    ],
  },
}));

vi.mock("@/services/api/mail", () => ({ list_mail_items }));

vi.mock("@/hooks/email_list_helpers", () => ({
  decrypt_envelope: async () => ({
    from: { email: "offers@paybis-deals.com", name: "" },
    subject: "Get 20% off this week",
  }),
}));

const { use_category_previews } = await import("@/hooks/use_category_previews");

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function render_probe(): HTMLDivElement {
  const container = document.createElement("div");

  document.body.appendChild(container);
  root = createRoot(container);

  function Probe() {
    const previews = use_category_previews(true);

    return <span>{previews.promotions?.sender ?? "none"}</span>;
  }

  act(() => {
    root!.render(<Probe />);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  keys_ready = false;
  generation += 1;
  listeners.clear();
  list_mail_items.mockClear();
});

describe("use_category_previews", () => {
  it("resolves previews once the vault keys arrive after mount", async () => {
    const container = render_probe();

    expect(container.textContent).toBe("none");
    expect(list_mail_items).not.toHaveBeenCalled();

    keys_ready = true;
    await act(async () => {
      for (const listener of listeners) listener();
    });

    expect(list_mail_items).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("Paybis Deals");
  });

  it("fetches immediately when the keys are already in memory", async () => {
    keys_ready = true;

    const container = render_probe();

    await act(async () => {});

    expect(list_mail_items).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("Paybis Deals");
  });
});
