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
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  contact_photo_needs_request,
  get_contact_photo_src,
  request_contact_photo,
  subscribe_contact_photos,
} from "@/services/contact_photo_cache";

export function use_contact_photo(
  email: string | null | undefined,
): string | null {
  const target = email?.trim() || "";

  const get_snapshot = useCallback(
    () => (target ? (get_contact_photo_src(target) ?? null) : null),
    [target],
  );

  const photo = useSyncExternalStore(
    subscribe_contact_photos,
    get_snapshot,
    get_snapshot,
  );

  useEffect(() => {
    if (!target) return;
    request_contact_photo(target);
  }, [target]);

  useEffect(() => {
    if (!target) return;

    return subscribe_contact_photos(() => {
      if (contact_photo_needs_request(target)) request_contact_photo(target);
    });
  }, [target]);

  return photo;
}
