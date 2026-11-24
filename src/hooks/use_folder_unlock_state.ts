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
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  get_folder_unlock_version,
  subscribe_folder_unlocks,
} from "@/services/folder_unlock_store";
import { count_unlocked_folders } from "@/hooks/use_protected_folder";
import { is_mail_item_locked } from "@/services/locked_folders";

type LockableMailItem = Parameters<typeof is_mail_item_locked>[0];

export function use_folder_unlock_version(): number {
  return useSyncExternalStore(
    subscribe_folder_unlocks,
    get_folder_unlock_version,
    get_folder_unlock_version,
  );
}

export function use_unlocked_folder_count(): number {
  use_folder_unlock_version();

  return count_unlocked_folders();
}

export function use_close_when_folder_locked(
  item: LockableMailItem | null | undefined,
  on_locked: () => void,
): void {
  const version = use_folder_unlock_version();
  const on_locked_ref = useRef(on_locked);
  const seen_version_ref = useRef(version);

  on_locked_ref.current = on_locked;

  useEffect(() => {
    if (seen_version_ref.current === version) return;
    seen_version_ref.current = version;
    if (!item) return;
    if (is_mail_item_locked(item)) on_locked_ref.current();
  }, [item, version]);
}
