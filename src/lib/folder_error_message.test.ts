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
import { describe, it, expect } from "vitest";

import {
  MAX_FOLDER_NAME_LENGTH,
  create_folder_error_message,
} from "@/lib/folder_error_message";

const t = ((key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key) as never;

describe("create_folder_error_message", () => {
  it("names the plan limit", () => {
    expect(create_folder_error_message("PLAN_LIMIT_EXCEEDED", t)).toBe(
      "common.folder_plan_limit_reached",
    );
  });

  it("names a duplicate instead of a generic failure", () => {
    expect(create_folder_error_message("DUPLICATE", t)).toBe(
      "common.folder_already_exists",
    );
  });

  it("passes the maximum length through for an invalid name", () => {
    expect(create_folder_error_message("INVALID_NAME", t)).toBe(
      `common.folder_name_too_long:{"max":${MAX_FOLDER_NAME_LENGTH}}`,
    );
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(create_folder_error_message(undefined, t)).toBe(
      "common.failed_to_create_folder_error",
    );
  });
});
