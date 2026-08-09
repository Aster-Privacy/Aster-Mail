import { describe, expect, it, vi } from "vitest";
import {
  ENVELOPE_CAPABILITY_MAX_MARKER,
  ENVELOPE_CAPABILITY_REPORT_INTERVAL_MS,
  report_envelope_capability_if_due,
  type EnvelopeCapabilityDeps,
  type EnvelopeCapabilityResult,
} from "./envelope_capability";

const user_id = "11111111-2222-3333-4444-555555555555";

function make_deps(overrides: Partial<EnvelopeCapabilityDeps> = {}) {
  const store = new Map<string, string>();
  const posts: Array<{
    client_id: string;
    max_envelope_marker: number;
    platform: string;
  }> = [];

  let clock = 1_000;

  const deps: EnvelopeCapabilityDeps = {
    now: () => clock,
    new_client_id: () => "fixed-client-id",
    read: (key) => store.get(key) ?? null,
    write: (key, value) => {
      store.set(key, value);
    },
    post: async (client_id, max_envelope_marker, platform) => {
      posts.push({ client_id, max_envelope_marker, platform });

      return {
        success: true,
        min_supported_marker: 4,
        pq_hybrid_enabled: true,
      } satisfies EnvelopeCapabilityResult;
    },
    platform: () => "web",
    ...overrides,
  };

  return {
    deps,
    posts,
    store,
    set_clock: (value: number) => {
      clock = value;
    },
  };
}

describe("report_envelope_capability_if_due", () => {
  it("reports marker 4 because the web client decapsulates ml-kem-768", async () => {
    const { deps, posts } = make_deps();

    const result = await report_envelope_capability_if_due(user_id, false, deps);

    expect(posts).toHaveLength(1);
    expect(posts[0].max_envelope_marker).toBe(ENVELOPE_CAPABILITY_MAX_MARKER);
    expect(posts[0].max_envelope_marker).toBe(4);
    expect(posts[0].platform).toBe("web");
    expect(result?.pq_hybrid_enabled).toBe(true);
  });

  it("persists and reuses one client id", async () => {
    const ids = ["first", "second"];
    const { deps, posts } = make_deps({ new_client_id: () => ids.shift() ?? "" });

    await report_envelope_capability_if_due(user_id, false, deps);
    await report_envelope_capability_if_due(user_id, true, deps);

    expect(posts.map((p) => p.client_id)).toEqual(["first", "first"]);
  });

  it("skips a second report inside the interval", async () => {
    const helper = make_deps();

    await report_envelope_capability_if_due(user_id, false, helper.deps);
    helper.set_clock(1_000 + 60_000);
    const second = await report_envelope_capability_if_due(
      user_id,
      false,
      helper.deps,
    );

    expect(second).toBeNull();
    expect(helper.posts).toHaveLength(1);
  });

  it("reports again once the interval elapses", async () => {
    const helper = make_deps();

    await report_envelope_capability_if_due(user_id, false, helper.deps);
    helper.set_clock(1_000 + ENVELOPE_CAPABILITY_REPORT_INTERVAL_MS);
    await report_envelope_capability_if_due(user_id, false, helper.deps);

    expect(helper.posts).toHaveLength(2);
  });

  it("re-reports well inside the ninety day server ttl", () => {
    expect(ENVELOPE_CAPABILITY_REPORT_INTERVAL_MS).toBeLessThan(
      90 * 24 * 60 * 60 * 1000,
    );
  });

  it("retries after a failed report", async () => {
    const post = vi.fn(async () => null);
    const { deps } = make_deps({ post });

    expect(await report_envelope_capability_if_due(user_id, false, deps)).toBeNull();
    await report_envelope_capability_if_due(user_id, false, deps);

    expect(post).toHaveBeenCalledTimes(2);
  });

  it("does not mark an unsuccessful response as reported", async () => {
    const helper = make_deps({
      post: async () => ({
        success: false,
        min_supported_marker: null,
        pq_hybrid_enabled: false,
      }),
    });

    await report_envelope_capability_if_due(user_id, false, helper.deps);
    await report_envelope_capability_if_due(user_id, false, helper.deps);

    expect(
      helper.store.get(`astermail_envelope_capability_reported_${user_id}`),
    ).toBeUndefined();
  });

  it("swallows a throwing transport", async () => {
    const { deps } = make_deps({
      post: async () => {
        throw new Error("offline");
      },
    });

    await expect(
      report_envelope_capability_if_due(user_id, false, deps),
    ).resolves.toBeNull();
  });

  it("never reports for a blank user id", async () => {
    const { deps, posts } = make_deps();

    expect(await report_envelope_capability_if_due("  ", false, deps)).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it("reports rather than going silent when the clock moves backwards", async () => {
    const helper = make_deps();

    await report_envelope_capability_if_due(user_id, false, helper.deps);
    helper.set_clock(5);
    await report_envelope_capability_if_due(user_id, false, helper.deps);

    expect(helper.posts).toHaveLength(2);
  });

  it("reports when the stored timestamp is corrupt", async () => {
    const helper = make_deps();

    helper.store.set(
      `astermail_envelope_capability_reported_${user_id}`,
      "not-a-number",
    );
    await report_envelope_capability_if_due(user_id, false, helper.deps);

    expect(helper.posts).toHaveLength(1);
  });

  it("marks the platform as desktop inside the tauri shell", async () => {
    const { deps, posts } = make_deps({ platform: () => "desktop" });

    await report_envelope_capability_if_due(user_id, false, deps);

    expect(posts[0].platform).toBe("desktop");
  });

  it("keeps reporting when storage writes are blocked", async () => {
    const { deps, posts } = make_deps({
      write: vi.fn(() => {
        throw new Error("quota");
      }),
    });

    const result = await report_envelope_capability_if_due(user_id, false, deps);

    expect(result?.success).toBe(true);
    expect(posts).toHaveLength(1);
  });
});
