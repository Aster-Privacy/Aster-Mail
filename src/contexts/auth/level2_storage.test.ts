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
import type { Level2Admission } from "@/services/crypto/vault_level2";

import { describe, it, expect, vi } from "vitest";

import { create_level2_storage, type Level2StorageDeps } from "./level2_storage";

interface Harness {
  deps: Level2StorageDeps;
  admission: { value: Level2Admission };
  epoch: { value: number };
  tag: { value: string | null };
  answer: (value: Level2Admission) => void;
}

function make_harness(): Harness {
  const resolvers: Array<(value: Level2Admission) => void> = [];
  const admission = { value: "unknown" as Level2Admission };
  const epoch = { value: 1 };
  const tag = { value: "kek-a" as string | null };

  return {
    admission,
    epoch,
    tag,
    answer: (value) => {
      admission.value = value;
      resolvers.shift()?.(value);
    },
    deps: {
      request_admission: vi.fn(
        () =>
          new Promise<Level2Admission>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
      reset_admission_state: vi.fn(() => {
        admission.value = "unknown";
      }),
      is_admitted: () => admission.value === "admitted",
      start_rekey: vi.fn(),
      stop_rekey: vi.fn(),
      run_work_factor: vi.fn(() => Promise.resolve()),
      reset_locked_folder_rekey: vi.fn(),
      reset_attachment_meta_cache: vi.fn(),
      vault_epoch: () => epoch.value,
      has_vault_for: () => true,
      data_kek_tag: () => Promise.resolve(tag.value),
      on_error: vi.fn(),
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

describe("level 2 storage controller", () => {
  it("starts level 2 work once for repeated ensure calls", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    controller.ensure("user-1");
    h.answer("admitted");
    await settle();
    controller.ensure("user-1");
    await settle();

    expect(h.deps.request_admission).toHaveBeenCalledTimes(1);
    expect(h.deps.start_rekey).toHaveBeenCalledTimes(1);
    expect(h.deps.start_rekey).toHaveBeenCalledWith("user-1");
    expect(h.deps.run_work_factor).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a vault for that user", async () => {
    const h = make_harness();

    h.deps.has_vault_for = () => false;

    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    controller.ensure(null);
    await settle();

    expect(h.deps.request_admission).not.toHaveBeenCalled();
  });

  it("keeps admission and the rekey across a same-owner clear", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    h.answer("admitted");
    await settle();

    controller.handle_cleared({ same_owner: true });
    await controller.handle_stored({ owner_id: "user-1", same_owner: true });
    controller.ensure("user-1");
    await settle();

    expect(h.deps.reset_admission_state).not.toHaveBeenCalled();
    expect(h.deps.reset_locked_folder_rekey).not.toHaveBeenCalled();
    expect(h.deps.stop_rekey).toHaveBeenCalledTimes(1);
    expect(h.deps.start_rekey).toHaveBeenCalledTimes(1);
    expect(h.admission.value).toBe("admitted");
    expect(controller.active_owner()).toBe("user-1");
  });

  it("resets everything when a different account clears the vault", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    h.answer("admitted");
    await settle();

    controller.handle_cleared({ same_owner: false });
    h.epoch.value += 1;

    expect(h.deps.reset_admission_state).toHaveBeenCalledTimes(1);
    expect(h.deps.reset_locked_folder_rekey).toHaveBeenCalledTimes(1);
    expect(h.deps.reset_attachment_meta_cache).toHaveBeenCalledTimes(1);
    expect(h.deps.stop_rekey).toHaveBeenCalledTimes(2);
    expect(controller.active_owner()).toBeNull();

    controller.ensure("user-2");
    h.answer("admitted");
    await settle();

    expect(h.deps.request_admission).toHaveBeenCalledTimes(2);
    expect(h.deps.start_rekey).toHaveBeenLastCalledWith("user-2");
  });

  it("drops an admission answer that arrives after the account changed", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    controller.handle_cleared({ same_owner: false });
    h.epoch.value += 1;
    h.answer("admitted");
    await settle();

    expect(h.deps.start_rekey).not.toHaveBeenCalled();
    expect(h.deps.run_work_factor).not.toHaveBeenCalled();
  });

  it("retries on the next store when admission could not be read", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    h.answer("unknown");
    await settle();

    expect(controller.active_owner()).toBeNull();

    await controller.handle_stored({ owner_id: "user-1", same_owner: true });
    h.answer("admitted");
    await settle();

    expect(h.deps.request_admission).toHaveBeenCalledTimes(2);
    expect(h.deps.start_rekey).toHaveBeenCalledTimes(1);
  });

  it("does not start the rekey when admission is refused", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    h.answer("refused");
    await settle();
    controller.ensure("user-1");
    await settle();

    expect(h.deps.start_rekey).not.toHaveBeenCalled();
    expect(h.deps.request_admission).toHaveBeenCalledTimes(1);
  });

  it("restarts the rekey when a same-owner store changes the data key", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    controller.ensure("user-1");
    h.answer("admitted");
    await settle();

    await controller.handle_stored({ owner_id: "user-1", same_owner: true });

    expect(h.deps.start_rekey).toHaveBeenCalledTimes(1);
    expect(h.deps.reset_attachment_meta_cache).not.toHaveBeenCalled();

    h.tag.value = "kek-b";
    await controller.handle_stored({ owner_id: "user-1", same_owner: true });

    expect(h.deps.reset_attachment_meta_cache).toHaveBeenCalledTimes(1);
    expect(h.deps.start_rekey).toHaveBeenCalledTimes(2);
    expect(h.deps.reset_admission_state).not.toHaveBeenCalled();
  });

  it("ignores stores that belong to a different account", async () => {
    const h = make_harness();
    const controller = create_level2_storage(h.deps);

    await controller.handle_stored({ owner_id: "user-2", same_owner: false });

    expect(h.deps.request_admission).not.toHaveBeenCalled();
  });
});
