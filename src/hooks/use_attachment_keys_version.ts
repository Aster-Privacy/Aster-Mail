//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useCallback, useSyncExternalStore } from "react";

import {
  attachment_keys_version,
  subscribe_attachment_keys,
} from "@/services/crypto/inbound_attachment_keys";

export function use_attachment_keys_version(mail_item_id?: string): number {
  const snapshot = useCallback(
    () => attachment_keys_version(mail_item_id),
    [mail_item_id],
  );

  return useSyncExternalStore(subscribe_attachment_keys, snapshot, snapshot);
}
