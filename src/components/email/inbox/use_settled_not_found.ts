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
import { use_settled_empty_state } from "@/components/email/inbox/use_settled_empty_state";

interface SettledNotFoundParams {
  kind: string;
  token: string | null;
  is_found: boolean;
  is_loading: boolean;
}

export function use_settled_not_found({
  kind,
  token,
  is_found,
  is_loading,
}: SettledNotFoundParams): boolean {
  return use_settled_empty_state({
    view_key: `${kind}:${token ?? ""}`,
    is_empty: token !== null && !is_found,
    is_settled: !is_loading,
  });
}
