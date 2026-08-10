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

import { get_app_query_param } from "@/lib/hard_redirect";

export type SignInDomain = "astermail.org" | "aster.cx";

export function parse_prefill_identity(): {
  local: string;
  domain: SignInDomain | null;
} {
  const raw = get_app_query_param("u") || "";
  const at_index = raw.indexOf("@");

  if (at_index === -1) return { local: raw, domain: null };

  const domain = raw.slice(at_index + 1).toLowerCase();

  return {
    local: raw.slice(0, at_index),
    domain: domain === "aster.cx" || domain === "astermail.org" ? domain : null,
  };
}
