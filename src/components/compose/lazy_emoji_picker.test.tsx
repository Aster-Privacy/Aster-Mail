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

const loader = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { count: 0, gate, release: () => release() };
});

vi.mock("@/components/compose/emoji_picker", async () => {
  loader.count += 1;
  await loader.gate;

  return {
    default: ({ on_select }: { on_select: (emoji: string) => void }) => (
      <button
        data-testid="emoji-picker"
        type="button"
        onClick={() => on_select("thumbs_up")}
      >
        pick
      </button>
    ),
  };
});

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

const { LazyEmojiPicker } = await import("./lazy_emoji_picker");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("LazyEmojiPicker", () => {
  it("loads the picker when it opens and passes the chosen emoji on", async () => {
    const on_select = vi.fn();

    expect(loader.count).toBe(0);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<LazyEmojiPicker on_select={on_select} />);
    });

    const view = container;
    const shell = view.querySelector<HTMLElement>('[role="status"]');

    expect(loader.count).toBe(1);
    expect(shell?.className).toContain("w-[360px]");

    loader.release();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(view.querySelector('[data-testid="emoji-picker"]')).not.toBeNull();
    });

    expect(view.querySelector('[role="status"]')).toBeNull();

    await act(async () => {
      view.querySelector<HTMLButtonElement>("button")!.click();
    });

    expect(on_select).toHaveBeenCalledTimes(1);
    expect(on_select).toHaveBeenCalledWith("thumbs_up");
    expect(loader.count).toBe(1);
  });
});
