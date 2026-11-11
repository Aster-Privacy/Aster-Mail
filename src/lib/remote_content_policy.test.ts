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
import { describe, it, expect } from "vitest";

import {
  allows_remote_image_grant,
  blocks_tracking_pixels,
  displayed_remote_content_setting,
  effective_remote_image_mode,
  image_mode_update,
  resolve_remote_content_preferences,
  type RemoteContentPreferences,
} from "./remote_content_policy";

const BASE: RemoteContentPreferences = {
  load_remote_images: "never",
  block_external_content: true,
  block_remote_images: true,
  block_remote_fonts: true,
  block_remote_css: true,
  block_tracking_pixels: true,
  low_network_mode: false,
};

describe("allows_remote_image_grant", () => {
  it("refuses a per-message choice when images never load", () => {
    expect(allows_remote_image_grant(BASE)).toBe(false);
    expect(
      allows_remote_image_grant({ ...BASE, load_remote_images: null }),
    ).toBe(false);
  });

  it("offers a per-message choice when the setting asks first", () => {
    expect(
      allows_remote_image_grant({ ...BASE, load_remote_images: "ask" }),
    ).toBe(true);
  });

  it("stays open when images always load", () => {
    expect(
      allows_remote_image_grant({ ...BASE, load_remote_images: "always" }),
    ).toBe(true);
    expect(
      allows_remote_image_grant({ ...BASE, block_remote_images: false }),
    ).toBe(true);
  });

  it("refuses a per-message choice in low network mode", () => {
    expect(
      allows_remote_image_grant({
        ...BASE,
        load_remote_images: "ask",
        low_network_mode: true,
      }),
    ).toBe(false);
  });
});

describe("blocks_tracking_pixels", () => {
  it("blocks whenever images do not load on their own", () => {
    expect(
      blocks_tracking_pixels({
        ...BASE,
        block_external_content: false,
        block_tracking_pixels: false,
      }),
    ).toBe(true);
  });

  it("follows the pixel switch when images always load", () => {
    const always = { ...BASE, load_remote_images: "always" as const };

    expect(blocks_tracking_pixels(always)).toBe(true);
    expect(
      blocks_tracking_pixels({ ...always, block_tracking_pixels: false }),
    ).toBe(false);
    expect(
      blocks_tracking_pixels({ ...always, block_external_content: false }),
    ).toBe(false);
  });
});

describe("effective_remote_image_mode", () => {
  it("keeps Never when tracking protection is off", () => {
    const stored = { ...BASE, block_external_content: false };

    expect(effective_remote_image_mode(stored)).toBe("never");
  });

  it("keeps Ask when tracking protection is off", () => {
    const stored = {
      ...BASE,
      load_remote_images: "ask" as const,
      block_external_content: false,
    };

    expect(effective_remote_image_mode(stored)).toBe("ask");
  });

  it("returns Always only when the image setting says so", () => {
    expect(
      effective_remote_image_mode({ ...BASE, load_remote_images: "always" }),
    ).toBe("always");
    expect(
      effective_remote_image_mode({ ...BASE, block_remote_images: false }),
    ).toBe("always");
  });

  it("treats a missing or unknown choice as Never", () => {
    expect(
      effective_remote_image_mode({ ...BASE, load_remote_images: null }),
    ).toBe("never");
    expect(
      effective_remote_image_mode({
        ...BASE,
        load_remote_images: "sometimes" as never,
      }),
    ).toBe("never");
  });

  it("returns Never in low network mode", () => {
    expect(
      effective_remote_image_mode({
        ...BASE,
        load_remote_images: "always",
        block_remote_images: false,
        low_network_mode: true,
      }),
    ).toBe("never");
  });
});

describe("resolve_remote_content_preferences", () => {
  it("blocks images and pixels under Never with tracking protection off", () => {
    expect(
      resolve_remote_content_preferences({
        ...BASE,
        block_external_content: false,
        block_tracking_pixels: false,
      }),
    ).toEqual({
      block_remote_images: true,
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: true,
    });
  });

  it("keeps the font and style choices when tracking protection is off", () => {
    const resolved = resolve_remote_content_preferences({
      ...BASE,
      block_external_content: false,
      block_remote_fonts: true,
      block_remote_css: false,
    });

    expect(resolved.block_remote_fonts).toBe(true);
    expect(resolved.block_remote_css).toBe(false);
  });

  it("blocks pixels under Always when tracking protection asks for it", () => {
    expect(
      resolve_remote_content_preferences({
        ...BASE,
        load_remote_images: "always",
      }),
    ).toMatchObject({
      block_remote_images: false,
      block_tracking_pixels: true,
    });
  });

  it("loads pixels under Always when tracking protection is off", () => {
    expect(
      resolve_remote_content_preferences({
        ...BASE,
        load_remote_images: "always",
        block_external_content: false,
      }),
    ).toMatchObject({
      block_remote_images: false,
      block_tracking_pixels: false,
    });
  });
});

describe("displayed_remote_content_setting", () => {
  it("shows the mode that is in force", () => {
    expect(
      displayed_remote_content_setting(
        { ...BASE, block_external_content: false },
        false,
      ),
    ).toEqual({
      image_mode: "never",
      blocks_images: true,
      blocks_fonts: true,
      blocks_css: true,
      locked_by: null,
    });
  });

  it("shows images as loading when a stored choice says Always", () => {
    const shown = displayed_remote_content_setting(
      { ...BASE, load_remote_images: "always" },
      false,
    );

    expect(shown.image_mode).toBe("always");
    expect(shown.blocks_images).toBe(false);
  });

  it("locks every control in lockdown", () => {
    expect(
      displayed_remote_content_setting(
        {
          ...BASE,
          load_remote_images: "always",
          block_remote_images: false,
          block_remote_fonts: false,
          block_remote_css: false,
        },
        true,
      ),
    ).toEqual({
      image_mode: "never",
      blocks_images: true,
      blocks_fonts: true,
      blocks_css: true,
      locked_by: "lockdown",
    });
  });

  it("locks every control in low network mode", () => {
    expect(
      displayed_remote_content_setting(
        {
          ...BASE,
          load_remote_images: "always",
          block_remote_images: false,
          block_remote_fonts: false,
          block_remote_css: false,
          low_network_mode: true,
        },
        false,
      ),
    ).toEqual({
      image_mode: "never",
      blocks_images: true,
      blocks_fonts: true,
      blocks_css: true,
      locked_by: "low_network",
    });
  });
});

describe("image_mode_update", () => {
  it("writes both stored fields so they cannot disagree", () => {
    expect(image_mode_update("always")).toEqual({
      block_remote_images: false,
      load_remote_images: "always",
    });
    expect(image_mode_update("ask")).toEqual({
      block_remote_images: true,
      load_remote_images: "ask",
    });
    expect(image_mode_update("never")).toEqual({
      block_remote_images: true,
      load_remote_images: "never",
    });
  });
});
