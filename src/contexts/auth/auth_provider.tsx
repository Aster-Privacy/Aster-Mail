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
import type { AuthProviderProps } from "./auth_types";

import { useEffect } from "react";

import { AuthContext } from "./use_auth_hook";
import { use_auth_provider_state } from "./use_auth_provider_state";

import { set_trust_primary_address } from "@/lib/sender_trust_store";
export function AuthProvider({ children }: AuthProviderProps) {
  const { context_value } = use_auth_provider_state();
  const primary_address = context_value.user?.email;

  useEffect(() => {
    set_trust_primary_address(primary_address);
  }, [primary_address]);

  return (
    <AuthContext.Provider value={context_value}>
      {children}
    </AuthContext.Provider>
  );
}
