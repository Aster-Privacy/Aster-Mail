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
import { describe, expect, it, beforeEach } from "vitest";

import {
  FREE_MAX_ATTACHMENT_SIZE,
  clear_attachment_limits_cache,
  get_max_attachment_size,
  get_max_total_attachments_size,
} from "@/services/attachment_limits";

describe("attachment limits", () => {
  beforeEach(() => {
    clear_attachment_limits_cache();
  });

  it("caps the total at the same size the server accepts", () => {
    expect(get_max_total_attachments_size()).toBe(get_max_attachment_size());
  });

  it("starts at the free plan size", () => {
    expect(get_max_attachment_size()).toBe(FREE_MAX_ATTACHMENT_SIZE);
  });
});
