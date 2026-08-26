import { describe, it, expect } from "vitest";

import {
  transformed_caret_position,
  apply_input_transform,
} from "./input_transform";

describe("transformed_caret_position", () => {
  it("keeps the caret when the transform preserves length", () => {
    expect(transformed_caret_position("abc", 2, (v) => v.toUpperCase())).toBe(
      2,
    );
  });

  it("moves the caret back by the number of dropped characters", () => {
    expect(
      transformed_caret_position("a-b-c", 4, (v) => v.replace(/-/g, "")),
    ).toBe(2);
  });

  it("clamps to the truncated length", () => {
    expect(transformed_caret_position("1234567", 7, (v) => v.slice(0, 6))).toBe(
      6,
    );
  });
});

describe("apply_input_transform", () => {
  it("returns the raw value untouched when the transform is a no-op", () => {
    const input = document.createElement("input");

    input.value = "abc";

    expect(apply_input_transform(input, (v) => v)).toBe("abc");
  });

  it("returns the transformed value", () => {
    const input = document.createElement("input");

    input.value = "a1b2";

    expect(apply_input_transform(input, (v) => v.replace(/\d/g, ""))).toBe(
      "ab",
    );
  });

  it("restores the caret once the input holds the transformed value", async () => {
    const input = document.createElement("input");

    document.body.appendChild(input);
    input.value = "a-b-c";
    input.setSelectionRange(4, 4);

    const next = apply_input_transform(input, (v) => v.replace(/-/g, ""));

    input.value = next;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(input.selectionStart).toBe(2);
    document.body.removeChild(input);
  });
});
