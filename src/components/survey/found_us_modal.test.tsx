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
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, createContext, useContext, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { FoundUsModal } from "./found_us_modal";

import { finish_found_us } from "@/services/api/found_us";
import { show_toast } from "@/components/toast/simple_toast";

vi.mock("@/services/api/found_us", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/found_us")>()),
  finish_found_us: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("@/components/ui/modal", () => {
  const pass = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Modal: ({ is_open, children }: { is_open: boolean; children?: ReactNode }) =>
      is_open ? <div data-testid="modal">{children}</div> : null,
    ModalHeader: pass,
    ModalTitle: pass,
    ModalDescription: pass,
    ModalBody: pass,
    ModalFooter: pass,
  };
});

vi.mock("@/components/ui/radio_group", () => {
  const radio_context = createContext<{
    value: string;
    disabled?: boolean;
    on_change: (value: string) => void;
  }>({ value: "", on_change: () => undefined });

  return {
    RadioGroup: ({
      value,
      disabled,
      onValueChange,
      children,
    }: {
      value: string;
      disabled?: boolean;
      onValueChange: (value: string) => void;
      children?: ReactNode;
    }) => (
      <radio_context.Provider
        value={{ value, disabled, on_change: onValueChange }}
      >
        <div role="radiogroup">{children}</div>
      </radio_context.Provider>
    ),
    RadioGroupItem: ({ value }: { value: string }) => {
      const group = useContext(radio_context);

      return (
        <input
          checked={group.value === value}
          data-value={value}
          disabled={group.disabled}
          type="radio"
          onChange={() => group.on_change(value)}
        />
      );
    },
  };
});

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const native_value_setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

const mocked_finish = vi.mocked(finish_found_us);
const mocked_toast = vi.mocked(show_toast);

describe("FoundUsModal", () => {
  let container: HTMLDivElement;
  let root: Root;
  let on_close: Mock<() => void>;
  let on_finished: Mock<() => void>;

  const render = async () => {
    await act(async () => {
      root.render(
        <FoundUsModal is_open on_close={on_close} on_finished={on_finished} />,
      );
    });
  };

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    ) as HTMLButtonElement;

  const click = async (element: HTMLElement) => {
    await act(async () => {
      element.click();
    });
  };

  const pick = async (value: string) => {
    await click(
      container.querySelector(`input[data-value="${value}"]`) as HTMLElement,
    );
  };

  const detail_input = () =>
    container.querySelector('input[type="text"]') as HTMLInputElement | null;

  const type_detail = async (value: string) => {
    const input = detail_input()!;

    await act(async () => {
      native_value_setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const press_enter = async (is_composing: boolean) => {
    await act(async () => {
      detail_input()!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          isComposing: is_composing,
        }),
      );
    });
  };

  const alert_text = () =>
    container.querySelector('[role="alert"]')?.textContent ?? null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    on_close = vi.fn();
    on_finished = vi.fn();
    mocked_finish.mockReset();
    mocked_toast.mockReset();
    mocked_finish.mockResolvedValue({ data: { ok: true } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows all fifteen options", async () => {
    await render();
    expect(container.querySelectorAll('input[type="radio"]').length).toBe(15);
  });

  it("asks for a choice before sending", async () => {
    await render();
    await click(button("found_us.send"));
    expect(alert_text()).toBe("found_us.pick_one_error");
    expect(mocked_finish).not.toHaveBeenCalled();
  });

  it("scrolls the error into view each time sending is blocked", async () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;

    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      await render();
      await click(button("found_us.send"));
      await click(button("found_us.send"));
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll).toHaveBeenLastCalledWith({ block: "nearest" });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("clears the choice error once an option is picked", async () => {
    await render();
    await click(button("found_us.send"));
    await pick("youtube");
    expect(alert_text()).toBeNull();
  });

  it("sends a listed option and thanks the user", async () => {
    await render();
    await pick("reddit");
    await click(button("found_us.send"));
    expect(mocked_finish).toHaveBeenCalledWith({ source: "reddit" });
    expect(mocked_toast).toHaveBeenCalledWith(
      "found_us.thanks",
      "success",
      6000,
    );
    expect(on_finished).toHaveBeenCalledTimes(1);
  });

  it("shows the text box only for other", async () => {
    await render();
    expect(detail_input()).toBeNull();
    await pick("other");
    expect(detail_input()).not.toBeNull();
    expect(document.activeElement).toBe(detail_input());
    await pick("friend");
    expect(detail_input()).toBeNull();
  });

  it("requires text for other, ignoring blank and hidden characters", async () => {
    await render();
    await pick("other");
    await type_detail("   " + String.fromCharCode(0x200b) + "  ");
    await click(button("found_us.send"));
    expect(alert_text()).toBe("found_us.other_required_error");
    expect(detail_input()!.getAttribute("aria-invalid")).toBe("true");
    expect(mocked_finish).not.toHaveBeenCalled();
  });

  it("clears the text error once the user types", async () => {
    await render();
    await pick("other");
    await click(button("found_us.send"));
    expect(alert_text()).toBe("found_us.other_required_error");
    await type_detail("a");
    expect(alert_text()).toBeNull();
  });

  it("sends cleaned text for other", async () => {
    await render();
    await pick("other");
    await type_detail("  a   podcast  ");
    await click(button("found_us.send"));
    expect(mocked_finish).toHaveBeenCalledWith({
      source: "other",
      detail: "a podcast",
    });
  });

  it("caps the text at 200 characters and shows the count", async () => {
    await render();
    await pick("other");
    await type_detail("x".repeat(250));
    expect(detail_input()!.value.length).toBe(200);
    expect(container.textContent).toContain(
      'found_us.char_count:{"used":200,"max":200}',
    );
  });

  it("sends with Enter but not while composing", async () => {
    await render();
    await pick("other");
    await type_detail("a blog");
    await press_enter(true);
    expect(mocked_finish).not.toHaveBeenCalled();
    await press_enter(false);
    expect(mocked_finish).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open when sending fails", async () => {
    mocked_finish.mockResolvedValue({ error: "boom", status: 500 });
    await render();
    await pick("github");
    await click(button("found_us.send"));
    expect(mocked_toast).toHaveBeenCalledWith("found_us.send_failed", "error");
    expect(on_finished).not.toHaveBeenCalled();
    expect(button("found_us.send").disabled).toBe(false);
  });

  it("closes quietly when the server no longer asks", async () => {
    mocked_finish.mockResolvedValue({ error: "forbidden", status: 403 });
    await render();
    await pick("github");
    await click(button("found_us.send"));
    expect(mocked_toast).not.toHaveBeenCalled();
    expect(on_finished).toHaveBeenCalledTimes(1);
  });

  it("skips without an answer even if an option is picked", async () => {
    await render();
    await pick("article");
    await click(button("found_us.skip"));
    expect(mocked_finish).toHaveBeenCalledWith(null);
    expect(mocked_toast).not.toHaveBeenCalled();
    expect(on_finished).toHaveBeenCalledTimes(1);
  });

  it("closes after a skip even when the request fails", async () => {
    mocked_finish.mockResolvedValue({ error: "offline", status: 0 });
    await render();
    await click(button("found_us.skip"));
    expect(mocked_toast).not.toHaveBeenCalled();
    expect(on_finished).toHaveBeenCalledTimes(1);
  });

  it("sends only once on a double click", async () => {
    let resolve_finish: (value: { data: { ok: boolean } }) => void = () =>
      undefined;

    mocked_finish.mockReturnValue(
      new Promise((resolve) => {
        resolve_finish = resolve;
      }),
    );
    await render();
    await pick("forum");
    const send = button("found_us.send");

    await act(async () => {
      send.click();
      send.click();
    });
    expect(send.disabled).toBe(true);
    await act(async () => {
      resolve_finish({ data: { ok: true } });
    });
    expect(mocked_finish).toHaveBeenCalledTimes(1);
    expect(on_finished).toHaveBeenCalledTimes(1);
  });
});
