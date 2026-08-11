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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => {
    state.fetches += 1;

    return {
      data: {
        items: Object.fromEntries(
          ids.map((id) => [
            id,
            [
              {
                id: `att-${id}`,
                encrypted_meta: id,
                meta_nonce: "n",
                size_bytes: 10,
              },
            ],
          ]),
        ),
      },
    };
  },
}));

const state = vi.hoisted(() => ({ placeholder: false, fetches: 0 }));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  DEFAULT_ATTACHMENT_CONTENT_TYPE: "application/octet-stream",
  resolve_attachment_meta: async ({
    encrypted_meta,
    size_bytes,
  }: {
    encrypted_meta: string;
    size_bytes: number;
  }) => ({
    filename: state.placeholder ? null : `${encrypted_meta}.pdf`,
    content_type: state.placeholder ? null : "application/pdf",
    session_key: "",
    size_bytes,
    is_placeholder: state.placeholder,
  }),
}));

const { use_attachment_previews, clear_attachment_preview_cache } =
  await import("@/hooks/use_attachment_previews");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Previews = ReturnType<typeof use_attachment_previews>;

let previews: Previews;

function Probe({ emails }: { emails: InboxEmail[] }) {
  previews = use_attachment_previews(emails);

  return null;
}

function grouped_email(id: string, members: string[]) {
  return { id, grouped_email_ids: members } as unknown as InboxEmail;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(emails: InboxEmail[]): Promise<void> {
  await act(async () => {
    root!.render(<Probe emails={emails} />);
  });
}

beforeEach(() => {
  clear_attachment_preview_cache();
  state.placeholder = false;
  state.fetches = 0;
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
});

describe("use_attachment_previews entry identity", () => {
  it("reuses merged entries for grouped rows across re-renders", async () => {
    const emails = [grouped_email("a", ["a", "a2"]), grouped_email("b", ["b"])];

    await render(emails);

    const first = previews.get("a");

    expect(first?.state).toBe("loaded");
    expect(first?.attachments.map((a) => a.id)).toEqual(["att-a", "att-a2"]);

    await render([...emails]);

    expect(previews.get("a")).toBe(first);
  });

  it("returns a new entry when the merged attachments change", async () => {
    await render([grouped_email("a", ["a", "a2"])]);

    const first = previews.get("a");

    await render([grouped_email("a", ["a"])]);

    expect(previews.get("a")).not.toBe(first);
    expect(previews.get("a")?.attachments.map((x) => x.id)).toEqual(["att-a"]);
  });
});

describe("use_attachment_previews unresolved keys", () => {
  it("still shows a chip when the session key is unavailable", async () => {
    state.placeholder = true;

    await render([grouped_email("a", ["a"])]);

    const entry = previews.get("a");

    expect(entry?.state).toBe("loaded");
    expect(entry?.attachments).toHaveLength(1);
    expect(entry?.attachments[0].filename).toBeTruthy();
  });

  it("refetches an unresolved row instead of caching the placeholder", async () => {
    state.placeholder = true;

    await render([grouped_email("a", ["a"])]);

    act(() => {
      root?.unmount();
    });
    root = createRoot(container!);
    state.placeholder = false;

    await render([grouped_email("a", ["a"])]);

    expect(state.fetches).toBe(2);
    expect(previews.get("a")?.attachments[0].filename).toBe("a.pdf");
  });
});
