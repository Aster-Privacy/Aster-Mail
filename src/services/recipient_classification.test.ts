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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("./api/keys", () => ({
  is_internal_email: (email: string) =>
    /@(astermail\.org|aster\.cx)$/i.test(email.trim()),
  get_recipient_public_key: (...args: unknown[]) => h.lookup(...args),
}));

import {
  begin_recipient_classification_session,
  classify_recipient,
  classify_recipients,
  classify_unresolved_recipient,
  clear_recipient_classification_cache,
  get_cached_recipient_classification,
  get_recipient_classification_version,
  is_internal_recipient,
  RecipientLookupError,
  subscribe_recipient_classification,
} from "./recipient_classification";
import {
  RecipientClassificationUnavailableError,
  SendError,
} from "./send_queue_types";

const HOSTED = "tracy@scofz.com";

function hosted_key() {
  return { data: { username: "tracy", public_key: "key", internal: true } };
}

function external_key() {
  return { data: { username: "someone", public_key: "key", internal: false } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

beforeEach(() => {
  clear_recipient_classification_cache();
  h.lookup.mockReset();
});

describe("static domains", () => {
  it("treats a static Aster address as internal without a lookup", async () => {
    expect(is_internal_recipient("friend@astermail.org")).toBe(true);
    expect(await classify_recipient("Friend@Aster.cx")).toBe("internal");
    expect(h.lookup).not.toHaveBeenCalled();
  });
});

describe("hosted domain lookup", () => {
  it("marks an address internal when the key lookup carries the internal marker", async () => {
    h.lookup.mockResolvedValue(hosted_key());

    expect(is_internal_recipient(HOSTED)).toBe(false);
    expect(await classify_recipient(HOSTED)).toBe("internal");
    expect(is_internal_recipient(HOSTED)).toBe(true);
    expect(h.lookup).toHaveBeenCalledWith("tracy", HOSTED);
  });

  it("keeps an address external when the key is found without the marker", async () => {
    h.lookup.mockResolvedValue(external_key());

    expect(await classify_recipient("someone@example.com")).toBe("external");
    expect(is_internal_recipient("someone@example.com")).toBe(false);
  });

  it("keeps an address external when the marker is missing entirely", async () => {
    h.lookup.mockResolvedValue({ data: { username: "a", public_key: "k" } });

    expect(await classify_recipient("a@example.com")).toBe("external");
  });

  it("caches a not found answer for the session", async () => {
    h.lookup.mockResolvedValue({
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });

    expect(await classify_recipient("nobody@example.com")).toBe("external");
    expect(await classify_recipient("nobody@example.com")).toBe("external");
    expect(h.lookup).toHaveBeenCalledTimes(1);
    expect(get_cached_recipient_classification("nobody@example.com")).toBe(
      "external",
    );
  });

  it("does not retry a not found answer", async () => {
    h.lookup.mockResolvedValue({
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });

    expect(await classify_recipient("nobody@example.com")).toBe("external");
    expect(h.lookup).toHaveBeenCalledTimes(1);
  });

  it("looks up an internal address once when the first answer succeeds", async () => {
    h.lookup.mockResolvedValue(hosted_key());

    expect(await classify_recipient(HOSTED)).toBe("internal");
    expect(h.lookup).toHaveBeenCalledTimes(1);
    expect(get_cached_recipient_classification(HOSTED)).toBe("internal");
  });
});

describe("lookup failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();

    return promise;
  }

  it("retries a server error and keeps an internal answer from the retry", async () => {
    h.lookup.mockResolvedValueOnce({
      error: "boom",
      code: "SERVER_ERROR",
      status: 500,
    });
    h.lookup.mockResolvedValueOnce(hosted_key());

    expect(await settle(classify_recipient(HOSTED))).toBe("internal");
    expect(is_internal_recipient(HOSTED)).toBe(true);
    expect(get_cached_recipient_classification(HOSTED)).toBe("internal");
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });

  it("retries a network error and keeps an internal answer from the retry", async () => {
    h.lookup.mockRejectedValueOnce(new Error("offline"));
    h.lookup.mockRejectedValueOnce(new Error("offline"));
    h.lookup.mockResolvedValueOnce(hosted_key());

    expect(await settle(classify_recipient(HOSTED))).toBe("internal");
    expect(is_internal_recipient(HOSTED)).toBe(true);
    expect(h.lookup).toHaveBeenCalledTimes(3);
  });

  it("stops retrying at a definitive not found answer", async () => {
    h.lookup.mockResolvedValueOnce({
      error: "boom",
      code: "SERVER_ERROR",
      status: 500,
    });
    h.lookup.mockResolvedValueOnce({
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });

    expect(await settle(classify_recipient(HOSTED))).toBe("external");
    expect(get_cached_recipient_classification(HOSTED)).toBe("external");
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });

  it("falls back to the unresolved classification without caching after a persistent server error", async () => {
    h.lookup.mockResolvedValue({
      error: "boom",
      code: "SERVER_ERROR",
      status: 500,
    });

    expect(await settle(classify_recipient(HOSTED))).toBe(
      classify_unresolved_recipient(HOSTED),
    );
    expect(is_internal_recipient(HOSTED)).toBe(false);
    expect(get_cached_recipient_classification(HOSTED)).toBeUndefined();
    expect(h.lookup).toHaveBeenCalledTimes(3);

    h.lookup.mockReset();
    h.lookup.mockResolvedValue(hosted_key());

    expect(await settle(classify_recipient(HOSTED))).toBe("internal");
  });

  it("falls back to the unresolved classification after a persistent network error", async () => {
    h.lookup.mockRejectedValue(new Error("offline"));

    expect(await settle(classify_recipient(HOSTED))).toBe("external");
    expect(is_internal_recipient(HOSTED)).toBe(false);
    expect(h.lookup).toHaveBeenCalledTimes(3);
  });

  it("retries a rate limited lookup without caching a failure", async () => {
    h.lookup.mockResolvedValue({
      error: "slow down",
      code: "RATE_LIMIT_EXCEEDED",
      status: 429,
    });

    expect(await settle(classify_recipient(HOSTED))).toBe("external");
    expect(get_cached_recipient_classification(HOSTED)).toBeUndefined();
    expect(h.lookup).toHaveBeenCalledTimes(3);
  });

  it("shares the retrying lookup between concurrent callers", async () => {
    h.lookup.mockResolvedValueOnce({
      error: "boom",
      code: "SERVER_ERROR",
      status: 500,
    });
    h.lookup.mockResolvedValueOnce(hosted_key());

    const first = classify_recipient(HOSTED);
    const second = classify_recipient(HOSTED);

    await vi.runAllTimersAsync();

    expect(await first).toBe("internal");
    expect(await second).toBe("internal");
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });
});

describe("unresolved classification", () => {
  it("keeps today's external fallback", () => {
    expect(classify_unresolved_recipient(HOSTED)).toBe("external");
  });
});

describe("address handling", () => {
  it("never looks up a malformed address", async () => {
    expect(await classify_recipient("not-an-address")).toBe("external");
    expect(await classify_recipient("two words@example.com")).toBe("external");
    expect(await classify_recipient("")).toBe("external");
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("never looks up a local part the key endpoint rejects", async () => {
    expect(await classify_recipient("o'brien@example.com")).toBe("external");
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("looks up a plus address by its base local part", async () => {
    h.lookup.mockResolvedValue(hosted_key());

    expect(await classify_recipient("tracy+news@scofz.com")).toBe("internal");
    expect(h.lookup).toHaveBeenCalledWith("tracy", "tracy+news@scofz.com");
  });

  it("matches addresses case insensitively and ignores a trailing dot", async () => {
    h.lookup.mockResolvedValue(hosted_key());

    expect(await classify_recipient(" Tracy@SCOFZ.com ")).toBe("internal");
    expect(is_internal_recipient("tracy@scofz.com")).toBe(true);
    expect(is_internal_recipient("TRACY@scofz.com.")).toBe(true);
    expect(await classify_recipient("tracy@scofz.com.")).toBe("internal");
    expect(h.lookup).toHaveBeenCalledTimes(1);
  });
});

describe("caching", () => {
  it("shares one lookup between concurrent callers", async () => {
    const pending = deferred<ReturnType<typeof hosted_key>>();

    h.lookup.mockReturnValue(pending.promise);

    const first = classify_recipient(HOSTED);
    const second = classify_recipient(HOSTED.toUpperCase());

    pending.resolve(hosted_key());

    expect(await first).toBe("internal");
    expect(await second).toBe("internal");
    expect(h.lookup).toHaveBeenCalledTimes(1);
  });

  it("classifies a list and returns results keyed by normalized address", async () => {
    h.lookup.mockImplementation(async (_username: string, email: string) =>
      email === HOSTED ? hosted_key() : external_key(),
    );

    const results = await classify_recipients([
      "Tracy@scofz.com",
      "friend@astermail.org",
      "someone@example.com",
      "someone@example.com",
    ]);

    expect(results.get(HOSTED)).toBe("internal");
    expect(results.get("friend@astermail.org")).toBe("internal");
    expect(results.get("someone@example.com")).toBe("external");
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous answer readable until a new session refreshes it", async () => {
    h.lookup.mockResolvedValueOnce(hosted_key());
    await classify_recipient(HOSTED);

    begin_recipient_classification_session();
    expect(is_internal_recipient(HOSTED)).toBe(true);

    h.lookup.mockResolvedValueOnce({
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });

    expect(await classify_recipient(HOSTED)).toBe("external");
    expect(is_internal_recipient(HOSTED)).toBe(false);
    expect(h.lookup).toHaveBeenCalledTimes(2);
  });

  it("drops a lookup that finishes after the cache was cleared", async () => {
    const pending = deferred<ReturnType<typeof hosted_key>>();

    h.lookup.mockReturnValue(pending.promise);

    const result = classify_recipient(HOSTED);

    clear_recipient_classification_cache();
    pending.resolve(hosted_key());

    expect(await result).toBe("internal");
    expect(is_internal_recipient(HOSTED)).toBe(false);
  });

  it("clears every cached answer", async () => {
    h.lookup.mockResolvedValue(hosted_key());
    await classify_recipient(HOSTED);

    clear_recipient_classification_cache();

    expect(is_internal_recipient(HOSTED)).toBe(false);
    expect(get_cached_recipient_classification(HOSTED)).toBeUndefined();
  });

  it("notifies subscribers only when an answer changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe_recipient_classification(listener);
    const start = get_recipient_classification_version();

    h.lookup.mockResolvedValue(hosted_key());
    await classify_recipient(HOSTED);
    begin_recipient_classification_session();
    await classify_recipient(HOSTED);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(get_recipient_classification_version()).toBe(start + 1);

    unsubscribe();
    clear_recipient_classification_cache();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("failed lookups in a send", () => {
  it("refuses to classify a list when a lookup fails", async () => {
    h.lookup.mockImplementation(async (_username: string, email: string) =>
      email === HOSTED
        ? { error: "boom", code: "SERVER_ERROR", status: 500 }
        : external_key(),
    );

    await expect(
      classify_recipients([HOSTED, "someone@example.com"]),
    ).rejects.toBeInstanceOf(RecipientLookupError);
    expect(is_internal_recipient(HOSTED)).toBe(false);
  });

  it("refuses to classify a list when a lookup throws", async () => {
    h.lookup.mockRejectedValue(new Error("offline"));

    await expect(classify_recipients([HOSTED])).rejects.toBeInstanceOf(
      RecipientLookupError,
    );
  });

  it("still classifies a list when every lookup answers", async () => {
    h.lookup.mockResolvedValue({
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });

    const results = await classify_recipients(["nobody@example.com"]);

    expect(results.get("nobody@example.com")).toBe("external");
  });

  it("keeps the last known answer when a later lookup fails", async () => {
    h.lookup.mockResolvedValueOnce(hosted_key());
    await classify_recipient(HOSTED);

    begin_recipient_classification_session();
    h.lookup.mockResolvedValueOnce({
      error: "boom",
      code: "SERVER_ERROR",
      status: 500,
    });

    const results = await classify_recipients([HOSTED]);

    expect(results.get(HOSTED)).toBe("internal");
    expect(is_internal_recipient(HOSTED)).toBe(true);
  });
});

describe("required resolution for sends", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function settle<T>(promise: Promise<T>): Promise<T> {
    const outcome = promise.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    await vi.runAllTimersAsync();
    const result = await outcome;

    if (!result.ok) throw result.error;

    return result.value;
  }

  it("resolves internal and external recipients when every lookup answers", async () => {
    h.lookup.mockImplementation(async (_username: string, email: string) =>
      email === HOSTED ? hosted_key() : external_key(),
    );

    const results = await settle(
      classify_recipients([HOSTED, "someone@example.com", "friend@aster.cx"], {
        require_resolved: true,
      }),
    );

    expect(results.get(HOSTED)).toBe("internal");
    expect(results.get("someone@example.com")).toBe("external");
    expect(results.get("friend@aster.cx")).toBe("internal");
  });

  it("treats a not found answer as external without blocking", async () => {
    h.lookup.mockResolvedValue({
      error: "User not found",
      code: "NOT_FOUND",
      status: 404,
    });

    const results = await settle(
      classify_recipients(["nobody@example.com"], { require_resolved: true }),
    );

    expect(results.get("nobody@example.com")).toBe("external");
  });

  it("throws a typed error naming the unresolved recipients", async () => {
    h.lookup.mockImplementation(async (_username: string, email: string) => {
      if (email === HOSTED) throw new Error("offline");

      return external_key();
    });

    const error = await settle(
      classify_recipients(
        ["Tracy@scofz.com", "someone@example.com", "friend@astermail.org"],
        { require_resolved: true },
      ),
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RecipientClassificationUnavailableError);
    expect(error).toBeInstanceOf(SendError);

    const typed = error as RecipientClassificationUnavailableError;

    expect(typed.type).toBe("recipient_classification_unavailable");
    expect(typed.recipients).toEqual([HOSTED]);
    expect(typed.message).toContain(HOSTED);
    expect(typed.message).not.toContain("{{recipients}}");
    expect(typed.message).not.toContain("someone@example.com");
    expect(get_cached_recipient_classification(HOSTED)).toBeUndefined();
  });

  it("blocks on a persistent server error", async () => {
    h.lookup.mockResolvedValue({
      error: "boom",
      code: "SERVER_ERROR",
      status: 500,
    });

    await expect(
      settle(classify_recipients([HOSTED], { require_resolved: true })),
    ).rejects.toBeInstanceOf(RecipientClassificationUnavailableError);
    expect(h.lookup).toHaveBeenCalledTimes(3);
  });
});
