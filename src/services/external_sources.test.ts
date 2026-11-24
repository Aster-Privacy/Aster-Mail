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
import { describe, it, expect } from "vitest";

import {
  apply_notify_choice,
  build_source_options,
  describe_source,
  label_for_source_value,
  notify_choice_for,
  toggle_source_value,
} from "./external_sources";

const LABELS = {
  aster: "Aster address",
  device: "Device",
  forwarding: "Forwarding",
  removed: "Removed",
};

const ACCOUNTS = [
  { account_token: "tok_a", email: "a@example.com", display_name: "A" },
  { account_token: "tok_b", email: "", display_name: "Second" },
];

describe("external source labels", () => {
  it("labels an external source with the account address", () => {
    expect(
      describe_source(
        { source_id: "s1", kind: "external", account_token: "tok_a" },
        ACCOUNTS,
        LABELS,
      ),
    ).toBe("a@example.com");
  });

  it("falls back to the display name when the address is empty", () => {
    expect(
      describe_source(
        { source_id: "s2", kind: "external", account_token: "tok_b" },
        ACCOUNTS,
        LABELS,
      ),
    ).toBe("Second");
  });

  it("marks an external source without a matching account as removed", () => {
    expect(
      describe_source(
        { source_id: "s3", kind: "external", account_token: "tok_gone" },
        ACCOUNTS,
        LABELS,
      ),
    ).toBe("Removed");
    expect(
      describe_source({ source_id: "s4", kind: "external" }, ACCOUNTS, LABELS),
    ).toBe("Removed");
  });

  it("uses the kind label for device and forwarding sources", () => {
    expect(
      describe_source({ source_id: "s5", kind: "device" }, ACCOUNTS, LABELS),
    ).toBe("Device");
    expect(
      describe_source(
        { source_id: "s6", kind: "forwarding" },
        ACCOUNTS,
        LABELS,
      ),
    ).toBe("Forwarding");
  });

  it("builds one option per source and drops duplicates", () => {
    expect(
      build_source_options(
        [
          { source_id: "s1", kind: "external", account_token: "tok_a" },
          { source_id: "s1", kind: "external", account_token: "tok_a" },
          { source_id: "s5", kind: "device" },
          { source_id: "aster", kind: "device" },
        ],
        ACCOUNTS,
        LABELS,
      ),
    ).toEqual([
      { value: "s1", label: "a@example.com" },
      { value: "s5", label: "Device" },
    ]);
  });

  it("resolves a stored value to its label", () => {
    const options = [{ value: "s1", label: "a@example.com" }];

    expect(label_for_source_value("aster", options, LABELS)).toBe(
      "Aster address",
    );
    expect(label_for_source_value("s1", options, LABELS)).toBe("a@example.com");
    expect(label_for_source_value("gone", options, LABELS)).toBe("Removed");
  });
});

describe("source value selection", () => {
  it("adds and removes a value", () => {
    expect(toggle_source_value(["aster"], "s1", 50)).toEqual(["aster", "s1"]);
    expect(toggle_source_value(["aster", "s1"], "aster", 50)).toEqual(["s1"]);
  });

  it("does not add a value past the limit", () => {
    expect(toggle_source_value(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggle_source_value(["a", "b"], "a", 2)).toEqual(["b"]);
  });
});

describe("source notification choices", () => {
  it("treats a source with no stored setting as all", () => {
    expect(notify_choice_for("s1", [])).toBe("all");
    expect(notify_choice_for("s1", [{ source_id: "s1", notify: "none" }])).toBe(
      "none",
    );
  });

  it("stores only the sources that are turned off", () => {
    const off = apply_notify_choice([], "s1", "none", ["s1", "s2"]);

    expect(off).toEqual([{ source_id: "s1", notify: "none" }]);
    expect(apply_notify_choice(off, "s1", "all", ["s1", "s2"])).toEqual([]);
  });

  it("drops settings for sources that no longer exist", () => {
    expect(
      apply_notify_choice(
        [
          { source_id: "gone", notify: "none" },
          { source_id: "s2", notify: "none" },
        ],
        "s1",
        "none",
        ["s1", "s2"],
      ),
    ).toEqual([
      { source_id: "s2", notify: "none" },
      { source_id: "s1", notify: "none" },
    ]);
  });
});
