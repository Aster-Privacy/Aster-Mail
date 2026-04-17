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
import { useState, useEffect, useCallback, useRef } from "react";

import { use_auth } from "@/contexts/auth_context";
import { has_passphrase_in_memory } from "@/services/crypto/memory_key_store";
import {
  run_metadata_migration,
  check_migration_status,
  type MigrationProgress,
} from "@/services/metadata_migration";

const MIGRATION_CHECK_KEY = "aster-metadata-migration-checked";

export function use_metadata_migration(): {
  progress: MigrationProgress | null;
  is_migrating: boolean;
  run_migration: () => Promise<void>;
} {
  const { is_authenticated, has_keys, user } = use_auth();
  const [progress, set_progress] = useState<MigrationProgress | null>(null);
  const [is_migrating, set_is_migrating] = useState(false);
  const migration_started = useRef(false);

  const run_migration = useCallback(async () => {
    if (is_migrating || !has_passphrase_in_memory()) {
      return;
    }

    set_is_migrating(true);

    await run_metadata_migration((p) => {
      set_progress(p);
    });

    set_is_migrating(false);

    if (user?.id) {
      sessionStorage.setItem(`${MIGRATION_CHECK_KEY}-${user.id}`, "true");
    }
  }, [is_migrating, user?.id]);

  useEffect(() => {
    if (!is_authenticated || !has_keys || !user?.id) {
      return;
    }

    if (!has_passphrase_in_memory()) {
      return;
    }

    const already_checked = sessionStorage.getItem(
      `${MIGRATION_CHECK_KEY}-${user.id}`,
    );

    if (already_checked || migration_started.current) {
      return;
    }

    migration_started.current = true;

    check_migration_status()
      .then((status) => {
        if (!status.is_migrated) {
          run_migration();
        } else {
          sessionStorage.setItem(`${MIGRATION_CHECK_KEY}-${user.id}`, "true");
        }
      })
      .catch(() => {
        migration_started.current = false;
      });
  }, [is_authenticated, has_keys, user?.id, run_migration]);

  return {
    progress,
    is_migrating,
    run_migration,
  };
}
