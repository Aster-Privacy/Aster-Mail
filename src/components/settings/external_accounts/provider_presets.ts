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
export interface ProviderPreset {
  host: string;
  port: number;
  smtp_host: string;
  smtp_port: number;
  use_tls: boolean;
  app_password_url?: string;
}

const PRESETS: Record<string, ProviderPreset> = {
  "gmail.com": {
    host: "imap.gmail.com",
    port: 993,
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    use_tls: true,
    app_password_url: "https://myaccount.google.com/apppasswords",
  },
  "googlemail.com": {
    host: "imap.gmail.com",
    port: 993,
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    use_tls: true,
    app_password_url: "https://myaccount.google.com/apppasswords",
  },
  "yahoo.com": {
    host: "imap.mail.yahoo.com",
    port: 993,
    smtp_host: "smtp.mail.yahoo.com",
    smtp_port: 587,
    use_tls: true,
    app_password_url: "https://login.yahoo.com/account/security",
  },
  "outlook.com": {
    host: "outlook.office365.com",
    port: 993,
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    use_tls: true,
  },
  "hotmail.com": {
    host: "outlook.office365.com",
    port: 993,
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    use_tls: true,
  },
  "live.com": {
    host: "outlook.office365.com",
    port: 993,
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    use_tls: true,
  },
  "icloud.com": {
    host: "imap.mail.me.com",
    port: 993,
    smtp_host: "smtp.mail.me.com",
    smtp_port: 587,
    use_tls: true,
    app_password_url: "https://account.apple.com",
  },
  "me.com": {
    host: "imap.mail.me.com",
    port: 993,
    smtp_host: "smtp.mail.me.com",
    smtp_port: 587,
    use_tls: true,
    app_password_url: "https://account.apple.com",
  },
};

export function get_provider_preset(email: string): ProviderPreset | null {
  const at = email.lastIndexOf("@");

  if (at === -1) return null;

  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();

  return PRESETS[domain] ?? null;
}

export function is_preset_host(host: string): boolean {
  const normalized = host.trim().toLowerCase();

  return Object.values(PRESETS).some((preset) => preset.host === normalized);
}
