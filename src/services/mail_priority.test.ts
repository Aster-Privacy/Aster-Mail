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
import { describe, expect, it } from "vitest";

import {
  MAIL_PRIORITIES,
  outgoing_priority,
  priority_from_headers,
  priority_headers,
  priority_request_field,
} from "@/services/mail_priority";

describe("outgoing_priority", () => {
  it("keeps high and low and drops normal", () => {
    expect(outgoing_priority("high")).toBe("high");
    expect(outgoing_priority("low")).toBe("low");
    expect(outgoing_priority("normal")).toBeUndefined();
    expect(outgoing_priority(undefined)).toBeUndefined();
    expect(outgoing_priority(null)).toBeUndefined();
  });

  it("lists every priority in menu order", () => {
    expect(MAIL_PRIORITIES).toEqual(["high", "normal", "low"]);
  });
});

describe("priority_request_field", () => {
  it("adds the field only for a non-normal priority", () => {
    expect(priority_request_field("high")).toEqual({ priority: "high" });
    expect(priority_request_field("low")).toEqual({ priority: "low" });
    expect(priority_request_field("normal")).toEqual({});
    expect(priority_request_field(undefined)).toEqual({});
  });

  it("leaves a request without the key when the priority is normal", () => {
    const request = { subject: "Hi", ...priority_request_field("normal") };

    expect("priority" in request).toBe(false);
  });
});

describe("priority_headers", () => {
  it("maps high to X-Priority 1 and Importance high", () => {
    expect(priority_headers("high")).toEqual([
      { name: "X-Priority", value: "1 (Highest)" },
      { name: "Importance", value: "high" },
    ]);
  });

  it("maps low to X-Priority 5 and Importance low", () => {
    expect(priority_headers("low")).toEqual([
      { name: "X-Priority", value: "5 (Lowest)" },
      { name: "Importance", value: "low" },
    ]);
  });

  it("adds no headers for normal priority", () => {
    expect(priority_headers("normal")).toEqual([]);
    expect(priority_headers(undefined)).toEqual([]);
  });

  it("round-trips through priority_from_headers", () => {
    for (const priority of MAIL_PRIORITIES) {
      expect(priority_from_headers(priority_headers(priority))).toBe(priority);
    }
  });
});

describe("priority_from_headers", () => {
  it("defaults to normal without headers", () => {
    expect(priority_from_headers(undefined)).toBe("normal");
    expect(priority_from_headers(null)).toBe("normal");
    expect(priority_from_headers([])).toBe("normal");
  });

  it("reads every X-Priority level", () => {
    const read = (value: string) =>
      priority_from_headers([{ name: "X-Priority", value }]);

    expect(read("1")).toBe("high");
    expect(read("2 (High)")).toBe("high");
    expect(read("3 (Normal)")).toBe("normal");
    expect(read("4")).toBe("low");
    expect(read(" 5 (Lowest)")).toBe("low");
  });

  it("ignores header name case", () => {
    expect(priority_from_headers([{ name: "x-priority", value: "1" }])).toBe(
      "high",
    );
    expect(priority_from_headers([{ name: "IMPORTANCE", value: "Low" }])).toBe(
      "low",
    );
  });

  it("reads Importance and Priority words", () => {
    expect(priority_from_headers([{ name: "Importance", value: "high" }])).toBe(
      "high",
    );
    expect(priority_from_headers([{ name: "Priority", value: "urgent" }])).toBe(
      "high",
    );
    expect(
      priority_from_headers([{ name: "Priority", value: "non-urgent" }]),
    ).toBe("low");
  });

  it("prefers X-Priority over Importance and Priority", () => {
    expect(
      priority_from_headers([
        { name: "Priority", value: "urgent" },
        { name: "Importance", value: "high" },
        { name: "X-Priority", value: "5" },
      ]),
    ).toBe("low");
    expect(
      priority_from_headers([
        { name: "Priority", value: "non-urgent" },
        { name: "Importance", value: "high" },
      ]),
    ).toBe("high");
  });

  it("falls back to normal for unknown values", () => {
    expect(priority_from_headers([{ name: "X-Priority", value: "9" }])).toBe(
      "normal",
    );
    expect(
      priority_from_headers([{ name: "Importance", value: "whenever" }]),
    ).toBe("normal");
    expect(priority_from_headers([{ name: "Subject", value: "1" }])).toBe(
      "normal",
    );
  });
});
