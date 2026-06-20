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
import type { SettingsSection } from "@/components/settings/settings_panel";

export interface SearchEntry {
  label: string;
  section: SettingsSection;
  breadcrumb: string;
  keywords?: string[];
}

// Add one entry here when adding a new setting to any section.
// label     - the exact name shown in the UI
// section   - which settings panel tab it lives in
// breadcrumb - human path shown in the search result (e.g. "Security > 2FA")
// keywords  - optional extra terms (abbreviations, synonyms)
export const SETTINGS_SEARCH_REGISTRY: SearchEntry[] = [
  // ── Appearance ───────────────────────────────────────────────────────────
  { label: "Dark mode",            section: "appearance", breadcrumb: "Appearance > Theme" },
  { label: "Light mode",           section: "appearance", breadcrumb: "Appearance > Theme" },
  { label: "System theme",         section: "appearance", breadcrumb: "Appearance > Theme" },
  { label: "Color theme",          section: "appearance", breadcrumb: "Appearance > Theme" },
  { label: "Layout density",       section: "appearance", breadcrumb: "Appearance > Layout", keywords: ["compact", "comfortable", "cozy"] },
  { label: "Language",             section: "appearance", breadcrumb: "Appearance > Language", keywords: ["locale", "region"] },
  { label: "Date format",          section: "appearance", breadcrumb: "Appearance > Date & Time" },
  { label: "Time format",          section: "appearance", breadcrumb: "Appearance > Date & Time", keywords: ["12 hour", "24 hour", "clock"] },
  { label: "Timezone",             section: "appearance", breadcrumb: "Appearance > Date & Time" },

  // ── Account ──────────────────────────────────────────────────────────────
  { label: "Display name",         section: "account", breadcrumb: "Account > Profile", keywords: ["change name"] },
  { label: "Username",             section: "account", breadcrumb: "Account > Profile" },
  { label: "Profile photo",        section: "account", breadcrumb: "Account > Profile", keywords: ["avatar", "picture"] },
  { label: "Recovery email",       section: "account", breadcrumb: "Account > Security" },
  { label: "Auto-logout",          section: "account", breadcrumb: "Account > Session", keywords: ["inactivity timeout", "sign out automatically"] },
  { label: "Delete account",       section: "account", breadcrumb: "Account > Danger Zone", keywords: ["close account", "remove account"] },

  // ── Accessibility ─────────────────────────────────────────────────────────
  { label: "Font size",            section: "accessibility", breadcrumb: "Accessibility > Text", keywords: ["text size", "larger text"] },
  { label: "Reduce motion",        section: "accessibility", breadcrumb: "Accessibility > Animations", keywords: ["animations", "transitions"] },
  { label: "High contrast",        section: "accessibility", breadcrumb: "Accessibility > Display" },
  { label: "Keyboard navigation",  section: "accessibility", breadcrumb: "Accessibility > Keyboard" },
  { label: "Screen reader",        section: "accessibility", breadcrumb: "Accessibility > Screen Reader" },

  // ── Security ──────────────────────────────────────────────────────────────
  { label: "Change password",      section: "security", breadcrumb: "Security > Password", keywords: ["reset password", "update password"] },
  { label: "Two-factor authentication", section: "security", breadcrumb: "Security > 2FA", keywords: ["2fa", "totp", "authenticator app", "otp", "google authenticator", "two factor"] },
  { label: "Passkeys",             section: "security", breadcrumb: "Security > Passkeys", keywords: ["fido", "webauthn", "biometric", "face id", "touch id", "fingerprint"] },
  { label: "Hardware security keys", section: "security", breadcrumb: "Security > Hardware Keys", keywords: ["yubikey", "fido2", "security key", "usb key"] },
  { label: "Backup codes",         section: "security", breadcrumb: "Security > Recovery", keywords: ["recovery codes", "one-time codes"] },
  { label: "Active sessions",      section: "security", breadcrumb: "Security > Sessions", keywords: ["sign out all devices", "logout everywhere", "login history"] },
  { label: "Security checkup",     section: "security", breadcrumb: "Security > Checkup" },
  { label: "Rename passkey",       section: "security", breadcrumb: "Security > Passkeys" },
  { label: "Rename hardware key",  section: "security", breadcrumb: "Security > Hardware Keys" },

  // ── Encryption ────────────────────────────────────────────────────────────
  { label: "Export public key",    section: "encryption", breadcrumb: "Encryption > Keys", keywords: ["download public key", "share public key"] },
  { label: "Export private key",   section: "encryption", breadcrumb: "Encryption > Keys", keywords: ["download private key", "backup private key"] },
  { label: "Import key",           section: "encryption", breadcrumb: "Encryption > Keys", keywords: ["upload key", "restore key"] },
  { label: "Rotate encryption key", section: "encryption", breadcrumb: "Encryption > Key Rotation", keywords: ["key rotation", "new key", "regenerate key"] },
  { label: "Recovery codes",       section: "encryption", breadcrumb: "Encryption > Recovery", keywords: ["regenerate codes", "backup codes"] },
  { label: "Storage format",       section: "encryption", breadcrumb: "Encryption > Storage" },
  { label: "Key algorithm",        section: "encryption", breadcrumb: "Encryption > Keys", keywords: ["ecc", "curve25519", "rsa", "algorithm"] },

  // ── Trusted Devices ───────────────────────────────────────────────────────
  { label: "Trusted devices",      section: "trusted_devices", breadcrumb: "Trusted Devices" },
  { label: "Revoke device",        section: "trusted_devices", breadcrumb: "Trusted Devices > Device", keywords: ["remove device", "untrust"] },
  { label: "Sign out device",      section: "trusted_devices", breadcrumb: "Trusted Devices > Device" },

  // ── Aliases & Domains ─────────────────────────────────────────────────────
  { label: "Create alias",         section: "aliases", breadcrumb: "Aliases > Create" },
  { label: "Custom domain",        section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["add domain", "domain setup"] },
  { label: "Domain verification",  section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["verify domain", "dns setup"] },
  { label: "DNS records",          section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["mx record", "dkim", "spf", "dmarc"] },
  { label: "Delete alias",         section: "aliases", breadcrumb: "Aliases > Manage", keywords: ["remove alias", "deactivate alias"] },

  // ── Ghost Aliases ─────────────────────────────────────────────────────────
  { label: "Create ghost alias",   section: "ghost_aliases", breadcrumb: "Ghost Aliases > Create", keywords: ["burn address", "anonymous address"] },
  { label: "Masked email",         section: "ghost_aliases", breadcrumb: "Ghost Aliases", keywords: ["hide email", "anonymous email", "disposable"] },

  // ── Billing ───────────────────────────────────────────────────────────────
  { label: "Current plan",         section: "billing", breadcrumb: "Billing > Plan" },
  { label: "Upgrade plan",         section: "billing", breadcrumb: "Billing > Plan", keywords: ["upgrade", "pro", "star", "supernova"] },
  { label: "Cancel subscription",  section: "billing", breadcrumb: "Billing > Plan", keywords: ["cancel", "downgrade"] },
  { label: "Payment method",       section: "billing", breadcrumb: "Billing > Payment", keywords: ["credit card", "add card", "update card"] },
  { label: "Billing history",      section: "billing", breadcrumb: "Billing > Invoices", keywords: ["invoices", "receipts", "past payments"] },
  { label: "Storage add-on",       section: "billing", breadcrumb: "Billing > Add-ons", keywords: ["buy storage", "extra storage", "more space"] },

  // ── Referral ──────────────────────────────────────────────────────────────
  { label: "Referral code",        section: "referral", breadcrumb: "Referral > Code", keywords: ["invite code", "share code"] },
  { label: "Invite a friend",      section: "referral", breadcrumb: "Referral", keywords: ["refer", "share"] },

  // ── Import ────────────────────────────────────────────────────────────────
  { label: "Import from Gmail",    section: "import", breadcrumb: "Import > Gmail", keywords: ["google import", "migrate gmail"] },
  { label: "Import from Outlook",  section: "import", breadcrumb: "Import > Outlook", keywords: ["microsoft import", "migrate outlook"] },
  { label: "Import from IMAP",     section: "import", breadcrumb: "Import > IMAP", keywords: ["imap import", "pop3 import", "migrate imap"] },
  { label: "Import from Proton",   section: "import", breadcrumb: "Import > Proton", keywords: ["protonmail", "migrate proton"] },

  // ── Bridge ────────────────────────────────────────────────────────────────
  { label: "Download Bridge",      section: "bridge", breadcrumb: "Bridge > Download" },
  { label: "SMTP settings",        section: "bridge", breadcrumb: "Bridge > Configuration", keywords: ["smtp server", "smtp port", "outgoing mail"] },
  { label: "IMAP settings",        section: "bridge", breadcrumb: "Bridge > Configuration", keywords: ["imap server", "imap port", "incoming mail"] },
  { label: "Connect Thunderbird",  section: "bridge", breadcrumb: "Bridge > Setup", keywords: ["thunderbird setup"] },
  { label: "Connect Apple Mail",   section: "bridge", breadcrumb: "Bridge > Setup", keywords: ["apple mail setup", "mac mail"] },

  // ── Notifications ─────────────────────────────────────────────────────────
  { label: "Push notifications",   section: "notifications", breadcrumb: "Notifications > Push", keywords: ["enable notifications", "disable notifications"] },
  { label: "Desktop notifications", section: "notifications", breadcrumb: "Notifications > Desktop" },
  { label: "Notification sound",   section: "notifications", breadcrumb: "Notifications > Sound" },
  { label: "Badge count",          section: "notifications", breadcrumb: "Notifications > Badge", keywords: ["unread badge", "app icon badge"] },
  { label: "Email summary",        section: "notifications", breadcrumb: "Notifications > Email" },

  // ── Signature ─────────────────────────────────────────────────────────────
  { label: "Add signature",        section: "signature", breadcrumb: "Signature > Create" },
  { label: "Edit signature",       section: "signature", breadcrumb: "Signature > Edit" },
  { label: "HTML signature",       section: "signature", breadcrumb: "Signature > Format" },
  { label: "Plain text signature", section: "signature", breadcrumb: "Signature > Format" },

  // ── Templates ─────────────────────────────────────────────────────────────
  { label: "Create template",      section: "templates", breadcrumb: "Templates > Create", keywords: ["new template", "add template"] },
  { label: "Manage templates",     section: "templates", breadcrumb: "Templates > Manage", keywords: ["edit template", "delete template"] },

  // ── Behavior ──────────────────────────────────────────────────────────────
  { label: "Reading pane",         section: "behavior", breadcrumb: "Behavior > Layout", keywords: ["preview pane", "split view"] },
  { label: "Thread view",          section: "behavior", breadcrumb: "Behavior > Threading", keywords: ["conversation view", "group by thread"] },
  { label: "Undo send",            section: "behavior", breadcrumb: "Behavior > Sending", keywords: ["unsend", "recall email"] },
  { label: "Send delay",           section: "behavior", breadcrumb: "Behavior > Sending", keywords: ["delay send", "scheduled send"] },
  { label: "Auto archive",         section: "behavior", breadcrumb: "Behavior > Reading" },
  { label: "Mark as read",         section: "behavior", breadcrumb: "Behavior > Reading" },
  { label: "Read receipts",        section: "behavior", breadcrumb: "Behavior > Reading", keywords: ["read confirmation", "open tracking"] },
  { label: "Swipe actions",        section: "behavior", breadcrumb: "Behavior > Swipe", keywords: ["swipe gesture"] },
  { label: "Keyboard shortcuts",   section: "behavior", breadcrumb: "Behavior > Keyboard" },

  // ── Sender Filters ───────────────────────────────────────────────────────
  { label: "Block sender",         section: "sender_filters", breadcrumb: "Mail Management > Block", keywords: ["blocklist", "ban sender"] },
  { label: "Allowlist",            section: "sender_filters", breadcrumb: "Mail Management > Allowlist", keywords: ["whitelist", "safe senders", "trusted senders"] },
  { label: "Spam filter",          section: "sender_filters", breadcrumb: "Mail Management > Spam", keywords: ["junk mail", "spam settings"] },
  { label: "Email forwarding",     section: "sender_filters", breadcrumb: "Mail Management > Forward", keywords: ["forward email", "auto-forward"] },

  // ── Mail Rules ───────────────────────────────────────────────────────────
  { label: "Create rule",          section: "mail_rules", breadcrumb: "Mail Rules > Create", keywords: ["add rule", "new filter"] },
  { label: "Auto label",           section: "mail_rules", breadcrumb: "Mail Rules > Actions", keywords: ["automatic label", "tag email"] },
  { label: "Auto archive",         section: "mail_rules", breadcrumb: "Mail Rules > Actions", keywords: ["automatic archive"] },
  { label: "Auto forward",         section: "mail_rules", breadcrumb: "Mail Rules > Actions", keywords: ["automatic forward"] },
  { label: "Move to folder",       section: "mail_rules", breadcrumb: "Mail Rules > Actions" },

  // ── SMTP Tokens ──────────────────────────────────────────────────────────
  { label: "Generate SMTP token",  section: "smtp_tokens", breadcrumb: "SMTP Tokens > Generate", keywords: ["smtp password", "app password", "create token"] },
  { label: "Revoke SMTP token",    section: "smtp_tokens", breadcrumb: "SMTP Tokens > Manage", keywords: ["delete token", "remove token"] },

  // ── Feedback ─────────────────────────────────────────────────────────────
  { label: "Report a bug",         section: "feedback", breadcrumb: "Feedback > Bug Report", keywords: ["bug report", "submit bug"] },
  { label: "Feature request",      section: "feedback", breadcrumb: "Feedback > Features", keywords: ["suggest feature", "request feature"] },
  { label: "Contact support",      section: "feedback", breadcrumb: "Feedback > Support", keywords: ["get help", "support ticket"] },

  // ── Developer ─────────────────────────────────────────────────────────────
  { label: "API token",            section: "developer", breadcrumb: "Developer > Tokens", keywords: ["access token", "api key"] },
  { label: "Developer mode",       section: "developer", breadcrumb: "Developer > Settings", keywords: ["dev mode", "debug mode"] },
  { label: "Request logs",         section: "developer", breadcrumb: "Developer > Logs" },

  // ── Updates ──────────────────────────────────────────────────────────────
  { label: "Check for updates",    section: "updates", breadcrumb: "Updates" },
  { label: "Auto-update",          section: "updates", breadcrumb: "Updates > Settings", keywords: ["automatic updates", "update automatically"] },
  { label: "Release notes",        section: "updates", breadcrumb: "Updates > Changelog", keywords: ["changelog", "what's new"] },

  // ── Family ───────────────────────────────────────────────────────────────
  { label: "Invite family member", section: "family", breadcrumb: "Family > Invite" },
  { label: "Manage family members", section: "family", breadcrumb: "Family > Members" },
  { label: "Children's accounts",  section: "family", breadcrumb: "Family > Children", keywords: ["kids account", "child account"] },
];
