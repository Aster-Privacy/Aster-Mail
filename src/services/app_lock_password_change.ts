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
import { get_app_lock_config, is_server_wrapped_config } from "./app_lock_store";
import { get_unlocked_key } from "./app_lock_wrap";

export function kept_app_lock_field(account_id: string): {
  keep_device_lock_id?: string;
} {
  const config = get_app_lock_config(account_id);

  if (!is_server_wrapped_config(config)) return {};
  if (!get_unlocked_key(account_id)) return {};

  return { keep_device_lock_id: config.wrap.device_lock_id };
}
