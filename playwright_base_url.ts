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
const DEFAULT_BASE_URL = "http://localhost:5173";
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]", "::1"];

function is_local(base_url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.includes(new URL(base_url).hostname);
  } catch {
    throw new Error(`E2E_BASE_URL is not a valid URL: ${base_url}`);
  }
}

export function resolve_base_url(): string {
  const base_url = process.env.E2E_BASE_URL || DEFAULT_BASE_URL;

  if (is_local(base_url)) return base_url;

  if (process.env.E2E_ALLOW_PROD !== "1") {
    throw new Error(
      `Refusing to run the end to end suite against ${base_url}. ` +
        "These tests sign in, start checkouts, and cancel subscriptions, " +
        "so they must not touch a deployed environment by accident. " +
        "Set E2E_BASE_URL to a localhost URL, or set E2E_ALLOW_PROD=1 to " +
        "confirm you intend to run against a deployed environment.",
    );
  }

  return base_url;
}
