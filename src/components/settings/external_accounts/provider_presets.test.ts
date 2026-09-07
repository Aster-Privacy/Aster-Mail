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
  get_provider_preset,
  is_preset_host,
} from "@/components/settings/external_accounts/provider_presets";

describe("get_provider_preset", () => {
  it("returns the Gmail servers for a gmail address", () => {
    expect(get_provider_preset("person@gmail.com")).toEqual({
      host: "imap.gmail.com",
      port: 993,
      smtp_host: "smtp.gmail.com",
      smtp_port: 587,
      use_tls: true,
      app_password_url: "https://myaccount.google.com/apppasswords",
    });
  });

  it("treats googlemail.com as gmail", () => {
    expect(get_provider_preset("person@googlemail.com")?.host).toBe(
      "imap.gmail.com",
    );
  });

  it("ignores case and surrounding whitespace in the domain", () => {
    expect(get_provider_preset("Person@GMAIL.com  ")?.host).toBe(
      "imap.gmail.com",
    );
  });

  it("uses the last at sign so a quoted local part cannot spoof the domain", () => {
    expect(get_provider_preset('"a@gmail.com"@evil.example')).toBeNull();
  });

  it("returns null for an unknown domain", () => {
    expect(get_provider_preset("person@example.com")).toBeNull();
  });

  it("returns null for a string with no at sign", () => {
    expect(get_provider_preset("not-an-address")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(get_provider_preset("")).toBeNull();
  });

  it("offers an app password link only where the provider requires one", () => {
    expect(get_provider_preset("a@gmail.com")?.app_password_url).toBe(
      "https://myaccount.google.com/apppasswords",
    );
    expect(
      get_provider_preset("a@outlook.com")?.app_password_url,
    ).toBeUndefined();
  });

  it("keeps every preset on an implicit TLS IMAP port", () => {
    for (const domain of [
      "gmail.com",
      "googlemail.com",
      "yahoo.com",
      "outlook.com",
      "hotmail.com",
      "live.com",
      "icloud.com",
      "me.com",
    ]) {
      const preset = get_provider_preset(`person@${domain}`);

      expect(preset).not.toBeNull();
      expect(preset?.port).toBe(993);
      expect(preset?.use_tls).toBe(true);
    }
  });
});

describe("is_preset_host", () => {
  it("recognizes a host this module filled in", () => {
    expect(is_preset_host("imap.gmail.com")).toBe(true);
    expect(is_preset_host("outlook.office365.com")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(is_preset_host("  IMAP.Gmail.com ")).toBe(true);
  });

  it("does not recognize a host the user typed", () => {
    expect(is_preset_host("mail.example.com")).toBe(false);
    expect(is_preset_host("")).toBe(false);
  });

  it("does not treat an SMTP host as a preset incoming host", () => {
    expect(is_preset_host("smtp.gmail.com")).toBe(false);
  });
});
