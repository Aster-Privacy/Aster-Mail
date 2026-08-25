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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { trigger_download } from "./download_blob";

describe("trigger_download", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("attaches the anchor to the document before clicking it", () => {
    let attached_while_clicked = false;

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        attached_while_clicked = document.body.contains(this);
      });

    trigger_download(new Blob(["a"]), "notes.txt");

    expect(click).toHaveBeenCalledTimes(1);
    expect(attached_while_clicked).toBe(true);
    expect(document.querySelectorAll("a").length).toBe(0);
  });

  it("keeps the object url alive until after the download starts", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    trigger_download(new Blob(["a"]), "notes.txt");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("sanitizes the suggested filename", () => {
    let suggested = "";

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      suggested = this.download;
    });

    trigger_download(new Blob(["a"]), "../../etc/passwd");

    expect(suggested).not.toContain("/");
  });
});
