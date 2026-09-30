import { describe, it, expect } from "vitest";

import { user_facing_error } from "./user_facing_error";

describe("user_facing_error", () => {
  it("returns the fallback for non errors", () => {
    expect(user_facing_error("boom", "fallback")).toBe("fallback");
    expect(user_facing_error(undefined, "fallback")).toBe("fallback");
  });

  it("returns the fallback for network failures", () => {
    expect(user_facing_error(new TypeError("Failed to fetch"), "fb")).toBe(
      "fb",
    );
    expect(user_facing_error(new Error("NetworkError"), "fb")).toBe("fb");
    expect(user_facing_error(new Error("Load failed"), "fb")).toBe("fb");
    expect(user_facing_error(new Error("connection refused"), "fb")).toBe("fb");
  });

  it("returns the fallback for aborted requests", () => {
    const aborted = new Error("The operation was aborted.");

    aborted.name = "AbortError";
    expect(user_facing_error(aborted, "fb")).toBe("fb");
  });

  it("returns the fallback for empty messages", () => {
    expect(user_facing_error(new Error("   "), "fb")).toBe("fb");
  });

  it("keeps a real server message", () => {
    expect(user_facing_error(new Error("Alias limit reached"), "fb")).toBe(
      "Alias limit reached",
    );
  });
});
