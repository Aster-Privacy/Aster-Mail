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
import type { AuthContextType } from "./auth_types";

import { createContext, useContext } from "react";

export const AuthContext = createContext<AuthContextType | null>(null);

function no_provider(name: string): never {
  throw new Error(`use_auth: ${name} called outside AuthProvider`);
}

const AUTH_LOADING_FALLBACK: AuthContextType = {
  user: null,
  is_loading: true,
  is_authenticated: false,
  has_keys: false,
  accounts: [],
  current_account_id: null,
  vault: null,
  login: async () => no_provider("login"),
  logout: async () => no_provider("logout"),
  logout_all: async () => no_provider("logout_all"),
  set_vault: async () => no_provider("set_vault"),
  add_account: async () => no_provider("add_account"),
  remove_account: async () => no_provider("remove_account"),
  switch_to_account: async () => no_provider("switch_to_account"),
  can_add_account: async () => false,
  account_count: 0,
  is_adding_account: false,
  set_is_adding_account: () => no_provider("set_is_adding_account"),
  update_user: async () => no_provider("update_user"),
  is_completing_registration: false,
  set_is_completing_registration: () =>
    no_provider("set_is_completing_registration"),
};

export function use_auth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    return AUTH_LOADING_FALLBACK;
  }

  return context;
}

export function use_auth_safe(): AuthContextType | null {
  return useContext(AuthContext);
}
