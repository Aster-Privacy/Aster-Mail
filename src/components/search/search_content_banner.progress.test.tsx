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
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const progress_state = {
  building: false,
  current: 0,
  total: 0,
};

const download_state = {
  paused: false,
  done: 0,
  total: 0,
};

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key, language: "en" }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: { email: "user@astermail.org" } }),
}));

vi.mock("@/components/ui/info_popover", () => ({
  InfoPopover: () => null,
}));

vi.mock("@aster/ui", () => ({
  Switch: () => null,
}));

vi.mock("@/hooks/use_search", () => ({
  pause_index_download: vi.fn(),
  resume_index_download: vi.fn(),
  use_indexing_progress: () => progress_state,
  use_index_download_state: () => download_state,
}));

const { SearchContentBanner } = await import("./search_content_banner");

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <SearchContentBanner
        enabled
        on_disable={() => {}}
        on_enable={() => {}}
      />,
    );
  });

  return container;
}

function progress_bar(el: HTMLDivElement): HTMLElement | null {
  return el.querySelector<HTMLElement>(".rounded-full.bg-surf-secondary");
}

beforeEach(() => {
  progress_state.building = false;
  progress_state.current = 0;
  progress_state.total = 0;
  download_state.paused = false;
  download_state.done = 0;
  download_state.total = 0;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("SearchContentBanner progress row", () => {
  it("shows no reserved row when nothing is downloading", () => {
    const el = render();

    expect(progress_bar(el)).toBeNull();
    expect(el.textContent).not.toContain("mail.indexing_messages");
  });

  it("shows the bar once a total is known", () => {
    progress_state.building = true;
    progress_state.current = 40;
    progress_state.total = 200;

    const el = render();

    expect(progress_bar(el)).not.toBeNull();
    expect(el.textContent).toContain("mail.message_download_status");
  });

  it("leaves no empty row while the total is still unknown", () => {
    progress_state.building = true;

    const el = render();

    expect(el.querySelector(".h-\\[38px\\]")).toBeNull();
    expect(progress_bar(el)).toBeNull();
  });

  it("adds the progress row only once the total is known", () => {
    progress_state.building = true;

    const unknown_total = render();

    expect(unknown_total.querySelector(".h-\\[38px\\]")).toBeNull();

    act(() => root?.unmount());
    container?.remove();

    progress_state.current = 10;
    progress_state.total = 100;

    const known_total = render();

    expect(known_total.querySelector(".h-\\[38px\\]")).not.toBeNull();
  });

  it("hides the bar when the index has finished but counters are latched", () => {
    progress_state.building = false;
    progress_state.current = 200;
    progress_state.total = 200;

    const el = render();

    expect(progress_bar(el)).toBeNull();
  });

  it("keeps the row mounted when the reported total briefly drops out", () => {
    progress_state.building = true;
    progress_state.current = 40;
    progress_state.total = 200;

    const el = render();

    expect(el.querySelector(".h-\\[38px\\]")).not.toBeNull();

    act(() => {
      progress_state.current = 0;
      progress_state.total = 0;
      root!.render(
        <SearchContentBanner
          enabled
          on_disable={() => {}}
          on_enable={() => {}}
        />,
      );
    });

    expect(el.querySelector(".h-\\[38px\\]")).not.toBeNull();
    expect(el.textContent).toContain("mail.message_download_status");
  });

  it("never walks the progress fill backwards within a session", () => {
    progress_state.building = true;
    progress_state.current = 120;
    progress_state.total = 200;

    const el = render();

    expect(progress_bar(el)?.firstElementChild).toHaveProperty(
      "style.width",
      "60%",
    );

    act(() => {
      progress_state.current = 20;
      root!.render(
        <SearchContentBanner
          enabled
          on_disable={() => {}}
          on_enable={() => {}}
        />,
      );
    });

    expect(progress_bar(el)?.firstElementChild).toHaveProperty(
      "style.width",
      "60%",
    );
  });

  it("shows the bar while paused with a known total", () => {
    progress_state.building = false;
    download_state.paused = true;
    download_state.done = 120;
    download_state.total = 400;

    const el = render();

    expect(progress_bar(el)).not.toBeNull();
    expect(el.textContent).toContain("mail.resume_download_action");
  });
});
