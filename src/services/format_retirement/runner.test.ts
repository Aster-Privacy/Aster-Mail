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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { BatchResult, FormatMigrator } from "./migrator";
import type { RunnerDeps } from "./runner";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reset_runner_state, run_format_migrations } from "./runner";
import { record_has_format, with_format_retired } from "./record";

interface Item {
  id: number;
  bound: boolean;
  body: string;
}

interface Store {
  items: Item[];
  fail_write?: (item: Item) => boolean;
  list_errors: number;
}

function make_store(count: number): Store {
  return {
    items: Array.from({ length: count }, (_, id) => ({
      id,
      bound: false,
      body: `body-${id}`,
    })),
    list_errors: 0,
  };
}

function fake_migrator(store: Store): FormatMigrator {
  return {
    id: "escrow_unbound",
    version: 1,
    detect: async () => true,
    async rewrap_batch(ctx, limit) {
      if (store.list_errors > 0) {
        store.list_errors -= 1;
        throw new Error("network");
      }

      const start = typeof ctx.state.cursor === "number" ? ctx.state.cursor : 0;
      const page = store.items.slice(start, start + limit);
      const result: BatchResult = {
        examined: 0,
        migrated: 0,
        failed: 0,
        done: false,
      };

      for (const item of page) {
        if (!ctx.is_active()) return result;
        result.examined += 1;
        if (item.bound) continue;
        if (store.fail_write?.(item)) {
          result.failed += 1;
          continue;
        }
        item.bound = true;
        result.migrated += 1;
      }

      ctx.state.cursor = start + page.length;
      result.done = start + page.length >= store.items.length;

      return result;
    },
    count: async () => store.items.filter((item) => !item.bound).length,
    verify: async () => true,
  };
}

interface Harness {
  vault: EncryptedVault;
  active: boolean;
  marker_writes: number;
  marker_ok: boolean;
  sleep: ReturnType<typeof vi.fn>;
  deps: RunnerDeps;
}

function harness(): Harness {
  const sleep = vi.fn(async (_ms: number) => undefined);
  const h = {
    vault: {} as EncryptedVault,
    active: true,
    marker_writes: 0,
    marker_ok: true,
    sleep,
  } as Harness;

  h.deps = {
    get_vault: () => h.vault,
    is_active: () => h.active,
    write_marker: async (_user, id, version) => {
      h.marker_writes += 1;
      if (!h.marker_ok) return false;
      h.vault = {
        ...h.vault,
        format_retirements: with_format_retired(h.vault, id, version, 0),
      };

      return true;
    },
    sleep,
  };

  return h;
}

beforeEach(() => reset_runner_state());
afterEach(() => vi.unstubAllEnvs());

describe("format migration runner", () => {
  it("rewraps every item, keeps it readable, then writes the marker", async () => {
    const store = make_store(120);
    const h = harness();
    const summary = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(store)],
      batch_size: 25,
    });

    expect(summary.outcomes.escrow_unbound).toBe("marked");
    expect(store.items.every((item) => item.bound)).toBe(true);
    expect(store.items[7].body).toBe("body-7");
    expect(record_has_format(h.vault, "escrow_unbound")).toBe(true);
    expect(summary.remaining.escrow_unbound).toBe(0);
  });

  it("does not write the marker while any item is left", async () => {
    const store = make_store(10);
    const h = harness();

    store.fail_write = (item) => item.id === 4;

    const summary = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(store)],
    });

    expect(summary.outcomes.escrow_unbound).toBe("incomplete");
    expect(h.marker_writes).toBe(0);
    expect(store.items[4]).toEqual({ id: 4, bound: false, body: "body-4" });
    expect(summary.remaining.escrow_unbound).toBe(1);
  });

  it("is idempotent and skips a class once it is marked", async () => {
    const store = make_store(5);
    const h = harness();
    const migrator = fake_migrator(store);

    await run_format_migrations("u1", h.deps, { migrators: [migrator] });
    reset_runner_state();

    const second = await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
    });

    expect(second.outcomes.escrow_unbound).toBe("retired");
    expect(h.marker_writes).toBe(1);
  });

  it("resumes after a crash mid-batch without losing finished items", async () => {
    const store = make_store(30);
    const h = harness();
    let checks = 0;

    h.deps.is_active = () => {
      checks += 1;

      return checks < 15;
    };

    const first = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(store)],
      batch_size: 10,
    });

    expect(first.outcomes.escrow_unbound).toBe("locked");
    expect(h.marker_writes).toBe(0);

    const done_before = store.items.filter((item) => item.bound).length;

    expect(done_before).toBeGreaterThan(0);
    expect(done_before).toBeLessThan(30);

    reset_runner_state();
    h.deps.is_active = () => true;

    const second = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(store)],
      batch_size: 10,
    });

    expect(second.outcomes.escrow_unbound).toBe("marked");
    expect(store.items.every((item) => item.bound)).toBe(true);
  });

  it("stops cleanly when the vault locks mid-run", async () => {
    const store = make_store(50);
    const h = harness();
    const migrator = fake_migrator(store);
    const original = migrator.rewrap_batch;

    migrator.rewrap_batch = async (ctx, limit) => {
      const result = await original(ctx, limit);

      h.active = false;

      return result;
    };

    const summary = await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
      batch_size: 10,
    });

    expect(summary.outcomes.escrow_unbound).toBe("locked");
    expect(h.marker_writes).toBe(0);
  });

  it("retries network errors with backoff, then defers", async () => {
    const store = make_store(5);
    const h = harness();

    store.list_errors = 2;

    const ok = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(store)],
    });

    expect(ok.outcomes.escrow_unbound).toBe("marked");
    expect(h.sleep).toHaveBeenCalledWith(2_000);
    expect(h.sleep).toHaveBeenCalledWith(8_000);

    const store2 = make_store(5);
    const h2 = harness();

    store2.list_errors = 10;

    const deferred = await run_format_migrations("u2", h2.deps, {
      migrators: [fake_migrator(store2)],
    });

    expect(deferred.outcomes.escrow_unbound).toBe("deferred");
    expect(store2.items.some((item) => item.bound)).toBe(false);
    expect(h2.marker_writes).toBe(0);
  });

  it("caps the work done in one session", async () => {
    const store = make_store(100);
    const h = harness();
    const summary = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(store)],
      budget: 30,
      batch_size: 10,
    });

    expect(summary.outcomes.escrow_unbound).toBe("budget");
    expect(summary.spent).toBe(30);
    expect(store.items.filter((item) => item.bound).length).toBe(30);
    expect(h.marker_writes).toBe(0);
  });

  it("lets two devices run at once and keeps one merged marker", async () => {
    const store = make_store(40);
    const a = harness();
    const b = harness();
    let shared = {} as EncryptedVault;

    for (const side of [a, b]) {
      side.deps.write_marker = async (_user, id, version) => {
        shared = {
          ...shared,
          format_retirements: with_format_retired(shared, id, version, 0),
        };

        return true;
      };
    }

    const [first, second] = await Promise.all([
      run_format_migrations("u1", a.deps, {
        migrators: [fake_migrator(store)],
        batch_size: 7,
      }),
      run_format_migrations("u1", b.deps, {
        migrators: [fake_migrator(store)],
        batch_size: 7,
      }),
    ]);

    expect(store.items.every((item) => item.bound)).toBe(true);
    expect(first.outcomes.escrow_unbound).toBe("marked");
    expect(second.outcomes.escrow_unbound).toBe("marked");
    expect(record_has_format(shared, "escrow_unbound")).toBe(true);
  });

  it("trusts a fresh count over stale progress before marking", async () => {
    const store = make_store(10);
    const h = harness();
    const migrator = fake_migrator(store);

    for (const item of store.items) item.bound = true;
    store.items.push({ id: 99, bound: false, body: "late" });

    const summary = await run_format_migrations("u1", h.deps, {
      migrators: [
        {
          ...migrator,
          rewrap_batch: async () => ({
            examined: 1,
            migrated: 0,
            failed: 0,
            done: true,
          }),
        },
      ],
    });

    expect(summary.outcomes.escrow_unbound).toBe("incomplete");
    expect(summary.remaining.escrow_unbound).toBe(1);
    expect(h.marker_writes).toBe(0);
  });

  it("defers when the marker write is rejected", async () => {
    const h = harness();

    h.marker_ok = false;

    const summary = await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(make_store(3))],
    });

    expect(summary.outcomes.escrow_unbound).toBe("deferred");
    expect(record_has_format(h.vault, "escrow_unbound")).toBe(false);
  });

  it("does nothing when the switch is off", async () => {
    vi.stubEnv("VITE_FORMAT_MIGRATION_DISABLED", "true");

    const store = make_store(3);
    const summary = await run_format_migrations("u1", harness().deps, {
      migrators: [fake_migrator(store)],
    });

    expect(summary.outcomes).toEqual({});
    expect(store.items.some((item) => item.bound)).toBe(false);
  });

  it("reports only aggregate counts and only when enabled", async () => {
    const h = harness();
    const report = vi.fn(async () => undefined);

    h.deps.report = report;
    h.marker_ok = false;
    await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(make_store(2))],
    });
    expect(report).not.toHaveBeenCalled();
    reset_runner_state();

    vi.stubEnv("VITE_FORMAT_REMAINING_REPORT", "true");
    await run_format_migrations("u1", h.deps, {
      migrators: [fake_migrator(make_store(2))],
    });
    expect(report).toHaveBeenCalledWith("u1", { escrow_unbound: 0 });
  });

  it("rewraps an old item that appears behind the saved place", async () => {
    const store = make_store(10);
    const h = harness();
    const migrator = fake_migrator(store);

    const first = await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
      budget: 5,
      batch_size: 5,
    });

    expect(first.outcomes.escrow_unbound).toBe("budget");
    store.items.unshift({ id: 100, bound: false, body: "behind" });

    await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
      batch_size: 5,
    });

    const third = await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
      batch_size: 5,
    });

    expect(third.outcomes.escrow_unbound).toBe("marked");
    expect(store.items[0]).toEqual({ id: 100, bound: true, body: "behind" });
    expect(store.items.every((item) => item.bound)).toBe(true);
    expect(record_has_format(h.vault, "escrow_unbound")).toBe(true);
  });

  it("never writes the marker while an item behind the saved place remains", async () => {
    const store = make_store(10);
    const h = harness();
    const migrator = fake_migrator(store);
    const count = vi.fn(migrator.count);

    migrator.count = count;

    await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
      budget: 5,
      batch_size: 5,
    });
    store.items.unshift({ id: 100, bound: false, body: "behind" });

    const second = await run_format_migrations("u1", h.deps, {
      migrators: [migrator],
      batch_size: 5,
    });

    expect(count).toHaveBeenCalled();
    expect(second.outcomes.escrow_unbound).toBe("incomplete");
    expect(second.remaining.escrow_unbound).toBe(1);
    expect(h.marker_writes).toBe(0);
    expect(record_has_format(h.vault, "escrow_unbound")).toBe(false);
  });
});
