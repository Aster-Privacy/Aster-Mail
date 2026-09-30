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
import { useCallback, useEffect, useState } from "react";

import { FolderPasswordModal } from "@/components/folders/folder_password_modal";
import {
  FOLDER_UNLOCK_REQUIRED_EVENT,
  type FolderUnlockRequiredDetail,
} from "@/services/locked_folders";

export function FolderUnlockPrompt() {
  const [target, set_target] = useState<FolderUnlockRequiredDetail | null>(
    null,
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<FolderUnlockRequiredDetail>).detail;

      if (!detail?.folder_id) return;

      set_target(detail);
    };

    window.addEventListener(FOLDER_UNLOCK_REQUIRED_EVENT, handler);

    return () => {
      window.removeEventListener(FOLDER_UNLOCK_REQUIRED_EVENT, handler);
    };
  }, []);

  const handle_close = useCallback(() => {
    set_target(null);
  }, []);

  if (!target) return null;

  return (
    <FolderPasswordModal
      key={target.folder_id}
      folder_id={target.folder_id}
      folder_name={target.folder_name}
      is_open={true}
      mode="unlock"
      on_close={handle_close}
      on_success={handle_close}
    />
  );
}
