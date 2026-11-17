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
import { GUARD_ACTION, id_subject } from "@/lib/crypto/guard_action";
import { guard_device_leave } from "@/services/api/guard";
import {
  forget_guard_device,
  get_guard_device,
} from "@/services/guard/guard_device";
import { sign_guard_action } from "@/services/guard/sign_action";

export async function leave_guard_on_sign_out(user_id: string): Promise<void> {
  const device = await get_guard_device(user_id).catch(() => null);

  if (!device) return;
  try {
    const device_id = await device.device_id();

    if (!device_id) return;
    const action = await sign_guard_action(
      device,
      user_id,
      GUARD_ACTION.remove_device,
      id_subject(device_id),
    );

    await guard_device_leave(action);
  } catch {
    return;
  } finally {
    await forget_guard_device(user_id).catch(() => undefined);
  }
}
