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
import { useCallback, useState } from "react";

import {
  NO_REMOTE_CONTENT_GRANTS,
  grant_remote_content as add_grant,
  type RemoteContentGrants,
} from "@/lib/remote_content_grants";

interface GrantState {
  scope_id: string | null;
  grants: RemoteContentGrants;
}

export function use_remote_content_grants(
  scope_id: string | null | undefined,
): {
  remote_content_grants: RemoteContentGrants;
  grant_remote_content: (message_id: string, types: string[]) => void;
} {
  const scope = scope_id ?? null;
  const [state, set_state] = useState<GrantState>({
    scope_id: scope,
    grants: NO_REMOTE_CONTENT_GRANTS,
  });
  const remote_content_grants =
    state.scope_id === scope ? state.grants : NO_REMOTE_CONTENT_GRANTS;

  const grant_remote_content = useCallback(
    (message_id: string, types: string[]) => {
      set_state((prev) => {
        const base =
          prev.scope_id === scope ? prev.grants : NO_REMOTE_CONTENT_GRANTS;
        const grants = add_grant(base, message_id, types);

        if (prev.scope_id === scope && grants === prev.grants) return prev;

        return { scope_id: scope, grants };
      });
    },
    [scope],
  );

  return { remote_content_grants, grant_remote_content };
}
