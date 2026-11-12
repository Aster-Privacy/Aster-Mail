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
export type StartupRoute = "sign_in" | "register";

function is_at(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}

export function predict_startup_route(
  path: string,
  has_stored_preferences: boolean,
): StartupRoute | null {
  if (is_at(path, "/register") || is_at(path, "/signup")) return "register";
  if (is_at(path, "/sign-in")) return "sign_in";
  if (path === "/" && !has_stored_preferences) return "sign_in";

  return null;
}
