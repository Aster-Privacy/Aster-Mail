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
import type { ApiResponse } from "@/services/api/client";
import type { EncryptedVault } from "../key_manager_core";
import type { ResealApi, ResealStep, StepResult } from "./reseal_io";

import { describe, expect, it } from "vitest";

import { array_to_base64 } from "../base64";
import { import_storage_aes_key } from "../storage_write_key";
import { open_with_any } from "./reseal_keys";
import { memory_progress_store } from "./reseal_io";
import { legacy_sweep_marker, run_legacy_key_sweep } from "./legacy_sweep";

type SweepVault = Pick<
  EncryptedVault,
  "data_kek" | "legacy_keks" | "storage_rekey" | "data_kek_random"
>;

const data_raw = new Uint8Array(32).fill(5);
const legacy_raw = new Uint8Array(32).fill(6);
const extra_raw = new Uint8Array(32).fill(8);

const quiet_api: ResealApi = {
  get: async <T>(): Promise<ApiResponse<T>> => ({ data: {} as T }),
  post: async <T>(): Promise<ApiResponse<T>> => ({ data: {} as T }),
  put: async <T>(): Promise<ApiResponse<T>> => ({ data: {} as T }),
};

async function sealed_under(raw: Uint8Array): Promise<{ ct: Uint8Array; nonce: Uint8Array }> {
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode("x")),
  );

  return { ct, nonce };
}

class RecordingStep implements ResealStep {
  name = "recording";
  runs = 0;
  opened_legacy = false;
  opened_extra = false;

  constructor(private readonly result: StepResult = "done") {}

  async run(ctx: Parameters<ResealStep["run"]>[0]): Promise<StepResult> {
    this.runs += 1;
    const legacy = await sealed_under(legacy_raw);
    const extra = await sealed_under(extra_raw);

    this.opened_legacy = (await open_with_any(ctx.keys.old_aes, legacy.ct, legacy.nonce)) !== null;
    this.opened_extra = (await open_with_any(ctx.keys.old_aes, extra.ct, extra.nonce)) !== null;

    return this.result;
  }
}

function vault(overrides: Partial<SweepVault> = {}): SweepVault {
  return {
    data_kek: array_to_base64(data_raw),
    data_kek_random: true,
    legacy_keks: [{ k: array_to_base64(legacy_raw), added_at: "2026-01-01T00:00:00Z" }],
    storage_rekey: { state: "done", started_at: "x", done_at: "y" },
    ...overrides,
  };
}

describe("run_legacy_key_sweep", () => {
  it("reseals under the legacy keys after the rekey is done and leaves the vault alone", async () => {
    const step = new RecordingStep();
    const source = vault();
    const snapshot = structuredClone(source);
    const store = memory_progress_store();
    const result = await run_legacy_key_sweep({
      vault: source,
      api: quiet_api,
      store,
      sleep: async () => {},
      steps: [step],
    });

    expect(result.status).toBe("done");
    expect(step.runs).toBe(1);
    expect(step.opened_legacy).toBe(true);
    expect(source).toEqual(snapshot);
    expect(store.load()).toBeNull();
  });

  it("offers extra old keys such as the password keys", async () => {
    const step = new RecordingStep();

    await run_legacy_key_sweep({
      vault: vault(),
      api: quiet_api,
      store: memory_progress_store(),
      sleep: async () => {},
      steps: [step],
      key_options: { extra_old_raws: [extra_raw.slice()] },
    });

    expect(step.opened_extra).toBe(true);
  });

  it("does nothing for an account without a random data key", async () => {
    const step = new RecordingStep();
    const result = await run_legacy_key_sweep({
      vault: vault({ data_kek_random: false }),
      api: quiet_api,
      store: memory_progress_store(),
      steps: [step],
    });

    expect(result.status).toBe("not_needed");
    expect(step.runs).toBe(0);
  });

  it("leaves a pending rekey to the main reseal", async () => {
    const step = new RecordingStep();
    const result = await run_legacy_key_sweep({
      vault: vault({ storage_rekey: { state: "pending", started_at: "x", prior_keys: [] } }),
      api: quiet_api,
      store: memory_progress_store(),
      steps: [step],
    });

    expect(result.status).toBe("not_needed");
    expect(step.runs).toBe(0);
  });

  it("does nothing when no old key differs from the data key", async () => {
    const step = new RecordingStep();
    const result = await run_legacy_key_sweep({
      vault: vault({ legacy_keks: [{ k: array_to_base64(data_raw), added_at: "x" }] }),
      api: quiet_api,
      store: memory_progress_store(),
      steps: [step],
    });

    expect(result.status).toBe("not_needed");
    expect(step.runs).toBe(0);
  });

  it("keeps its progress when a step is incomplete", async () => {
    const store = memory_progress_store();
    const result = await run_legacy_key_sweep({
      vault: vault(),
      api: quiet_api,
      store,
      sleep: async () => {},
      steps: [new RecordingStep("incomplete")],
    });

    expect(result.status).toBe("interrupted");
    expect(store.load()).not.toBeNull();
  });

  it("reads the same keys the storage key importer accepts", async () => {
    await expect(import_storage_aes_key(legacy_raw.slice())).resolves.toBeDefined();
  });
});

describe("legacy_sweep_marker", () => {
  it("is stable for the same keys in any order", async () => {
    const a = vault({
      legacy_keks: [
        { k: array_to_base64(legacy_raw), added_at: "1" },
        { k: array_to_base64(extra_raw), added_at: "2" },
      ],
    });
    const b = vault({
      legacy_keks: [
        { k: array_to_base64(extra_raw), added_at: "3" },
        { k: array_to_base64(legacy_raw), added_at: "4" },
      ],
    });

    expect(await legacy_sweep_marker(a)).toBe(await legacy_sweep_marker(b));
  });

  it("changes when a password change adds a legacy key", async () => {
    const before = vault();
    const after = vault({
      legacy_keks: [
        ...(before.legacy_keks ?? []),
        { k: array_to_base64(extra_raw), added_at: "z" },
      ],
    });

    expect(await legacy_sweep_marker(after)).not.toBe(await legacy_sweep_marker(before));
  });

  it("changes when the data key changes and never contains a key", async () => {
    const marker = await legacy_sweep_marker(vault());
    const other = await legacy_sweep_marker(vault({ data_kek: array_to_base64(extra_raw) }));

    expect(other).not.toBe(marker);
    expect(marker).not.toContain(array_to_base64(legacy_raw));
    expect(marker).not.toContain(array_to_base64(data_raw));
    expect(marker).toMatch(/^[0-9a-f]{64}$/);
  });
});
