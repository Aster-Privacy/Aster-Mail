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
  build_security_criteria,
  security_percent,
  type SecurityCriterionSource,
} from "./security_criteria";

const none: SecurityCriterionSource = {
  totp_enabled: false,
  passkey_registered: false,
  recovery_email_verified: false,
  login_alerts_enabled: false,
  block_tracking_pixels: false,
  block_remote_images: false,
  strip_exif_on_compose: false,
};

const all: SecurityCriterionSource = {
  totp_enabled: true,
  passkey_registered: true,
  recovery_email_verified: true,
  login_alerts_enabled: true,
  block_tracking_pixels: true,
  block_remote_images: true,
  strip_exif_on_compose: true,
};

describe("security criteria", () => {
  it("scores an unprotected account at zero", () => {
    expect(security_percent(build_security_criteria(none))).toBe(0);
  });

  it("scores a fully protected account at one hundred", () => {
    expect(security_percent(build_security_criteria(all))).toBe(100);
  });

  it("rounds a partial score", () => {
    const criteria = build_security_criteria({ ...none, totp_enabled: true });

    expect(security_percent(criteria)).toBe(14);
  });

  it("routes the recovery email criterion to the account section", () => {
    const criteria = build_security_criteria(none);
    const recovery = criteria.find((item) => item.id === "recovery_email");

    expect(recovery?.section).toBe("account");
    expect(recovery?.anchor).toBeUndefined();
  });

  it("gives every security criterion an anchor to scroll to", () => {
    const criteria = build_security_criteria(none).filter(
      (item) => item.section === "security",
    );

    expect(criteria).toHaveLength(6);
    expect(criteria.every((item) => Boolean(item.anchor))).toBe(true);
  });

  it("marks only the enabled criteria as met", () => {
    const criteria = build_security_criteria({
      ...none,
      passkey_registered: true,
      block_remote_images: true,
    });
    const met = criteria.filter((item) => item.met).map((item) => item.id);

    expect(met).toEqual(["passkey", "remote_images"]);
  });

  it("returns zero for an empty criteria list", () => {
    expect(security_percent([])).toBe(0);
  });
});
