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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { FoundUsPrompt } from "./found_us_prompt";

import {
  finish_found_us,
  get_found_us_status,
  snooze_found_us,
} from "@/services/api/found_us";

const auth_state: { user: { id: string } | null } = { user: { id: "u1" } };

vi.mock("@/services/api/found_us", () => ({
  get_found_us_status: vi.fn(),
  finish_found_us: vi.fn(),
  snooze_found_us: vi.fn(),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => auth_state,
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      className,
      "data-testid": test_id,
    }: {
      children?: ReactNode;
      className?: string;
      "data-testid"?: string;
    }) => (
      <div className={className} data-testid={test_id}>
        {children}
      </div>
    ),
  },
}));

vi.mock("./found_us_modal", () => ({
  FoundUsModal: ({
    is_open,
    on_finished,
  }: {
    is_open: boolean;
    on_finished: () => void;
  }) =>
    is_open ? (
      <div data-testid="found-us-modal">
        <button type="button" onClick={on_finished}>
          finish
        </button>
      </div>
    ) : null,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocked_status = vi.mocked(get_found_us_status);
const mocked_finish = vi.mocked(finish_found_us);
const mocked_snooze = vi.mocked(snooze_found_us);

describe("FoundUsPrompt", () => {
  let container: HTMLDivElement;
  let root: Root;

  const render = async (
    props: {
      is_suppressed?: boolean;
      on_visibility_change?: (is_visible: boolean) => void;
    } = {},
  ) => {
    await act(async () => {
      root.render(<FoundUsPrompt {...props} />);
    });
  };

  const banner = () => container.querySelector('[data-testid="found-us-banner"]');

  const modal = () => container.querySelector('[data-testid="found-us-modal"]');

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    ) as HTMLButtonElement;

  const click = async (label: string) => {
    await act(async () => {
      button(label).click();
    });
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    auth_state.user = { id: "u1" };
    mocked_status.mockReset();
    mocked_finish.mockReset();
    mocked_snooze.mockReset();
    mocked_status.mockResolvedValue({ data: { eligible: true } });
    mocked_finish.mockResolvedValue({ data: { ok: true } });
    mocked_snooze.mockResolvedValue({ data: { ok: true } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows the banner to an eligible user", async () => {
    const on_visibility_change = vi.fn();

    await render({ on_visibility_change });
    expect(banner()).not.toBeNull();
    expect(on_visibility_change).toHaveBeenLastCalledWith(true);
  });

  it("stays hidden when the user is not eligible", async () => {
    mocked_status.mockResolvedValue({ data: { eligible: false } });
    await render();
    expect(banner()).toBeNull();
  });

  it("stays hidden when the status request fails", async () => {
    mocked_status.mockResolvedValue({ error: "offline", status: 0 });
    await render();
    expect(banner()).toBeNull();
  });

  it("stays hidden and asks nothing when signed out", async () => {
    auth_state.user = null;
    await render();
    expect(mocked_status).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it("hides while another banner has priority", async () => {
    const on_visibility_change = vi.fn();

    await render({ is_suppressed: true, on_visibility_change });
    expect(banner()).toBeNull();
    expect(on_visibility_change).toHaveBeenLastCalledWith(false);
    await render({ is_suppressed: false, on_visibility_change });
    expect(banner()).not.toBeNull();
  });

  it("opens the question window from the banner", async () => {
    await render();
    await click("found_us.banner_answer");
    expect(modal()).not.toBeNull();
  });

  it("hides the banner once the window finishes", async () => {
    await render();
    await click("found_us.banner_answer");
    await click("finish");
    expect(modal()).toBeNull();
    expect(banner()).toBeNull();
  });

  it("offers a reminder or a permanent opt-out on dismiss", async () => {
    await render();
    await click("found_us.banner_dismiss");
    expect(button("found_us.remind_later")).toBeDefined();
    expect(button("found_us.dont_ask")).toBeDefined();
    expect(button("found_us.banner_answer")).toBeUndefined();
  });

  it("snoozes for later", async () => {
    await render();
    await click("found_us.banner_dismiss");
    await click("found_us.remind_later");
    expect(mocked_snooze).toHaveBeenCalledTimes(1);
    expect(mocked_finish).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it("stops asking for good", async () => {
    await render();
    await click("found_us.banner_dismiss");
    await click("found_us.dont_ask");
    expect(mocked_finish).toHaveBeenCalledWith(null);
    expect(mocked_snooze).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
  });

  it("ignores a late answer for a previous account", async () => {
    let resolve_first: (value: { data: { eligible: boolean } }) => void = () =>
      undefined;

    mocked_status.mockReturnValueOnce(
      new Promise((resolve) => {
        resolve_first = resolve;
      }),
    );
    mocked_status.mockResolvedValueOnce({ data: { eligible: false } });
    await render();
    auth_state.user = { id: "u2" };
    await render();
    await act(async () => {
      resolve_first({ data: { eligible: true } });
    });
    expect(banner()).toBeNull();
  });

  it("asks again for a newly signed-in account", async () => {
    await render();
    await click("found_us.banner_dismiss");
    await click("found_us.remind_later");
    expect(banner()).toBeNull();
    auth_state.user = { id: "u2" };
    await render();
    expect(mocked_status).toHaveBeenCalledTimes(2);
    expect(banner()).not.toBeNull();
  });
});
