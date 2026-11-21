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
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OtpInput } from "@/components/ui/otp_input";
import { clean_guard_code_input } from "@/components/guard/guard_code_entry";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function Harness({
  length,
  sanitize,
}: {
  length: number;
  sanitize?: (raw: string) => string;
}) {
  const [value, set_value] = useState("");

  return (
    <>
      <OtpInput
        aria_label="code"
        id_prefix="box"
        length={length}
        sanitize={sanitize}
        value={value}
        onChange={set_value}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

function render(length: number, sanitize?: (raw: string) => string) {
  act(() => {
    root.render(<Harness length={length} sanitize={sanitize} />);
  });
}

function box(index: number): HTMLInputElement {
  return container.querySelector(`#box_${index}`) as HTMLInputElement;
}

function value(): string {
  return container.querySelector('[data-testid="value"]')?.textContent ?? "";
}

function type_into(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function backspace(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
    );
  });
}

function paste(input: HTMLInputElement, text: string) {
  const event = Object.assign(
    new Event("paste", { bubbles: true, cancelable: true }),
    { clipboardData: { getData: () => text } },
  );

  act(() => {
    input.dispatchEvent(event);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OtpInput", () => {
  it("moves focus to the next box after a digit", () => {
    render(2);
    act(() => box(0).focus());
    type_into(box(0), "4");

    expect(value()).toBe("4");
    expect(document.activeElement).toBe(box(1));
    type_into(box(1), "7");
    expect(value()).toBe("47");
  });

  it("goes back one box on backspace in an empty box", () => {
    render(2);
    type_into(box(0), "4");
    expect(document.activeElement).toBe(box(1));
    backspace(box(1));

    expect(document.activeElement).toBe(box(0));
  });

  it("fills every box from a paste", () => {
    render(2);
    paste(box(0), "47");

    expect(value()).toBe("47");
    expect(box(0).value).toBe("4");
    expect(box(1).value).toBe("7");
  });

  it("ignores characters the sanitizer drops", () => {
    render(2);
    type_into(box(0), "a");

    expect(value()).toBe("");
    expect(document.activeElement).not.toBe(box(1));
  });

  it("advances and pastes a guard code with its own alphabet", () => {
    render(5, clean_guard_code_input);
    act(() => box(0).focus());
    type_into(box(0), "b");

    expect(value()).toBe("B");
    expect(document.activeElement).toBe(box(1));
    paste(box(1), "cd-f2");
    expect(value()).toBe("BCDF2");
    expect(document.activeElement).toBe(box(4));
  });
});
