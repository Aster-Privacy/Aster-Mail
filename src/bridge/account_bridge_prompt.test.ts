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

import { ask_device_fingerprint } from "./account_bridge_prompt";

const STRINGS = {
  title: "Link device",
  requester: "https://app.link.test",
  notice: "Linking gives the app on desk full access.",
  warning: "Continue only if you started this.",
  label: "Device fingerprint",
  hint: "Enter the device fingerprint.",
  placeholder: "XXXX XXXX XXXX XXXX XXXX",
  confirm_label: "Link device",
  cancel_label: "Cancel",
};

function input(): HTMLInputElement {
  return document.querySelector("input")!;
}

function submit(trusted: boolean) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });

  Object.defineProperty(event, "isTrusted", { value: trusted });
  document.querySelectorAll("button")[1]!.dispatchEvent(event);
}

function press_enter(trusted: boolean) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });

  Object.defineProperty(event, "isTrusted", { value: trusted });
  input().dispatchEvent(event);
}

function type(value: string) {
  input().value = value;
  input().dispatchEvent(new Event("input"));
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("ask_device_fingerprint", () => {
  it("shows who gets access and returns what the person typed", async () => {
    const answer = ask_device_fingerprint(document, STRINGS, 60_000);

    expect(document.body.textContent).toContain(STRINGS.notice);
    expect(document.body.textContent).toContain(STRINGS.requester);
    expect(document.body.textContent).toContain(STRINGS.warning);
    type("9b16af790a6ae2f255d3");
    expect(input().value).toBe("9B16 AF79 0A6A E2F2 55D3");
    submit(true);

    await expect(answer).resolves.toBe("9B16 AF79 0A6A E2F2 55D3");
    expect(document.body.children).toHaveLength(0);
  });

  it("ignores a scripted submit", async () => {
    const answer = ask_device_fingerprint(document, STRINGS, 60_000);
    let result: string | null | undefined;

    void answer.then((value) => {
      result = value;
    });
    type("9B16 AF79 0A6A E2F2 55D3");
    submit(false);
    await Promise.resolve();

    expect(result).toBeUndefined();
    expect(document.querySelector("form")).not.toBeNull();

    (document.querySelectorAll("button")[0] as HTMLButtonElement).click();
    await expect(answer).resolves.toBeNull();
  });

  it("confirms without a form submission", async () => {
    const answer = ask_device_fingerprint(document, STRINGS, 60_000);

    expect(document.querySelectorAll("button")[1]!.type).toBe("button");
    type("9B16 AF79 0A6A E2F2 55D3");
    press_enter(false);
    press_enter(true);

    await expect(answer).resolves.toBe("9B16 AF79 0A6A E2F2 55D3");
  });

  it("returns nothing on cancel", async () => {
    const answer = ask_device_fingerprint(document, STRINGS, 60_000);

    (document.querySelectorAll("button")[0] as HTMLButtonElement).click();

    await expect(answer).resolves.toBeNull();
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();

    const answer = ask_device_fingerprint(document, STRINGS, 1000);

    vi.advanceTimersByTime(1000);

    await expect(answer).resolves.toBeNull();
    expect(document.body.children).toHaveLength(0);
  });
});
