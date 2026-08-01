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
import type { SettingsSection } from "@/components/settings/settings_content";

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
  { label: "Color theme",          section: "appearance", breadcrumb: "Appearance > Theme", keywords: ["purple", "green", "rose", "orange", "teal", "indigo", "amber", "cyan", "slate", "aster blue", "blue", "lime", "fuchsia", "magenta", "emerald", "pink", "black", "dark", "oled", "accent color"] },
  { label: "Custom theme",         section: "appearance", breadcrumb: "Appearance > Theme", keywords: ["custom color", "palette", "seed color", "custom palette", "starplan", "premium theme"] },
  { label: "Font",                 section: "appearance", breadcrumb: "Appearance > Theme", keywords: ["font switcher", "typeface", "font family", "starplan"] },
  { label: "Email font",           section: "appearance", breadcrumb: "Appearance > Theme", keywords: ["monospace", "mono", "message font", "reading font", "email typeface", "courier"] },
  { label: "Layout density",       section: "appearance", breadcrumb: "Appearance > Layout", keywords: ["compact", "comfortable", "cozy"] },
  { label: "Language",             section: "appearance", breadcrumb: "Appearance > Language", keywords: ["locale", "region"] },
  { label: "Date Format",          section: "appearance", breadcrumb: "Appearance > Language & format" },
  { label: "Time format",          section: "appearance", breadcrumb: "Appearance > Language & format", keywords: ["12 hour", "24 hour", "clock"] },
  { label: "Time Zone",            section: "appearance", breadcrumb: "Appearance > Language & format", keywords: ["timezone", "utc", "region", "local time"] },

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
  { label: "Account recovery",     section: "security", breadcrumb: "Security > Account Recovery", keywords: ["restore account", "forgot password", "recovery methods"] },
  { label: "Recovery phrase",      section: "security", breadcrumb: "Security > Account Recovery", keywords: ["12 words", "seed phrase", "mnemonic", "master key"] },
  { label: "Recover older data",   section: "security", breadcrumb: "Security > Account Recovery", keywords: ["old password", "unlock older data", "restore old mail", "resurrection"] },
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
  { label: "Buy a domain",         section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["purchase domain", "register domain", "domain search", "new domain"] },
  { label: "Domain verification",  section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["verify domain", "dns setup"] },
  { label: "DNS records",          section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["mx record", "dkim", "spf", "dmarc"] },
  { label: "Delete alias",         section: "aliases", breadcrumb: "Aliases > Manage", keywords: ["remove alias", "deactivate alias"] },

  // ── Ghost Aliases ─────────────────────────────────────────────────────────
  { label: "Create ghost alias",   section: "aliases", breadcrumb: "Aliases & Domains > Ghost Aliases", keywords: ["burn address", "anonymous address"] },
  { label: "Masked email",         section: "aliases", breadcrumb: "Aliases & Domains > Ghost Aliases", keywords: ["hide email", "anonymous email", "disposable"] },

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
  { label: "Notification Position", section: "notifications", breadcrumb: "Notifications > Position", keywords: ["toast position", "popup position", "top right", "bottom right", "top left", "bottom left"] },

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
  { label: "Settings view",        section: "behavior", breadcrumb: "Behavior > Advanced", keywords: ["settings popup", "settings full screen", "settings window", "open settings"] },
  { label: "Thread view",          section: "behavior", breadcrumb: "Behavior > Threading", keywords: ["conversation view", "group by thread"] },
  { label: "Undo send",            section: "behavior", breadcrumb: "Behavior > Sending", keywords: ["unsend", "recall email"] },
  { label: "Send delay",           section: "behavior", breadcrumb: "Behavior > Sending", keywords: ["delay send", "scheduled send"] },
  { label: "Auto archive",         section: "behavior", breadcrumb: "Behavior > Reading" },
  { label: "Mark as read",         section: "behavior", breadcrumb: "Behavior > Reading" },
  { label: "After Archiving or Deleting", section: "behavior", breadcrumb: "Behavior > Reading", keywords: ["auto advance", "next email", "open next", "auto open"] },
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

  // ── Appearance (view modes) ──────────────────────────────────────────────
  { label: "Email view mode",      section: "appearance", breadcrumb: "Appearance > Layout", keywords: ["popup", "split view", "full page", "open email", "reading layout"] },
  { label: "Compose window mode",  section: "appearance", breadcrumb: "Appearance > Layout", keywords: ["floating popup", "full screen compose", "minimized compose", "compose layout"] },

  // ── Accessibility (full coverage) ────────────────────────────────────────
  { label: "Reduce Transparency",  section: "accessibility", breadcrumb: "Accessibility > Vision", keywords: ["transparency", "blur", "opaque"] },
  { label: "Underline Links",      section: "accessibility", breadcrumb: "Accessibility > Vision", keywords: ["links", "underline"] },
  { label: "Dyslexia-Friendly Font", section: "accessibility", breadcrumb: "Accessibility > Reading", keywords: ["dyslexia", "opendyslexic", "readable font"] },
  { label: "Text Spacing",         section: "accessibility", breadcrumb: "Accessibility > Reading", keywords: ["letter spacing", "line height", "spacing"] },
  { label: "Compact Mode",         section: "accessibility", breadcrumb: "Accessibility > Motion & Layout", keywords: ["density", "spacing", "more content"] },
  { label: "Enable shortcuts",     section: "accessibility", breadcrumb: "Accessibility > Keyboard Shortcuts", keywords: ["keyboard shortcuts", "hotkeys", "keybindings"] },
  { label: "View all keyboard shortcuts", section: "accessibility", breadcrumb: "Accessibility > Keyboard Shortcuts", keywords: ["shortcut list", "hotkey list"] },
  { label: "Low Network Mode",     section: "accessibility", breadcrumb: "Accessibility > Performance", keywords: ["network", "performance", "slow connection", "metered", "data saver", "plain text", "bandwidth", "offline"] },

  // ── Account (full coverage) ──────────────────────────────────────────────
  { label: "Primary address",      section: "account", breadcrumb: "Account > Profile", keywords: ["email address", "main address"] },
  { label: "Inactivity window",    section: "account", breadcrumb: "Account > Session", keywords: ["auto logout", "session timeout", "inactivity"] },
  { label: "Reset all settings",   section: "account", breadcrumb: "Account > Advanced", keywords: ["defaults", "restore defaults", "factory reset"] },

  // ── Notifications (full coverage) ────────────────────────────────────────
  { label: "Quiet Hours",          section: "notifications", breadcrumb: "Notifications > Quiet Hours", keywords: ["do not disturb", "dnd", "silence", "schedule", "mute hours"] },
  { label: "Notification Duration", section: "notifications", breadcrumb: "Notifications > Duration", keywords: ["toast duration", "popup duration", "how long"] },
  { label: "New emails",           section: "notifications", breadcrumb: "Notifications > Events", keywords: ["notify new mail", "incoming mail alert"] },
  { label: "Replies",              section: "notifications", breadcrumb: "Notifications > Events", keywords: ["reply notifications"] },
  { label: "Mentions",             section: "notifications", breadcrumb: "Notifications > Events", keywords: ["mention notifications"] },
  { label: "Send test notification", section: "notifications", breadcrumb: "Notifications > Test", keywords: ["test notification", "try notification"] },

  // ── Behavior (full coverage) ─────────────────────────────────────────────
  { label: "Translate incoming mail", section: "behavior", breadcrumb: "Behavior > Translation", keywords: ["translation", "translate", "language", "bergamot"] },
  { label: "Languages you read",   section: "behavior", breadcrumb: "Behavior > Translation", keywords: ["known languages", "no translate"] },
  { label: "Never translate",      section: "behavior", breadcrumb: "Behavior > Translation", keywords: ["skip translation", "exclude language"] },
  { label: "Conversation Grouping", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", keywords: ["thread", "group emails", "conversation view"] },
  { label: "Conversation Order",   section: "behavior", breadcrumb: "Behavior > Reading & Conversations", keywords: ["oldest first", "newest first", "thread order"] },
  { label: "Thread count badge position", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", keywords: ["thread count", "badge position"] },
  { label: "Reading Pane Position", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", keywords: ["preview pane", "right side", "bottom", "hidden"] },
  { label: "Show Message Size",    section: "behavior", breadcrumb: "Behavior > Reading & Conversations", keywords: ["email size", "message size", "kb", "mb"] },
  { label: "Force Dark Mode for Emails", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", keywords: ["dark emails", "invert email", "dark mode email"] },
  { label: "Sidebar Width",        section: "behavior", breadcrumb: "Behavior > Navigation Panel", keywords: ["sidebar size", "panel width"] },
  { label: "Minimize Sidebar",     section: "behavior", breadcrumb: "Behavior > Navigation Panel", keywords: ["collapse sidebar", "hide sidebar"] },
  { label: "Default Reply",        section: "behavior", breadcrumb: "Behavior > Composing & Replies", keywords: ["reply all", "reply to sender"] },
  { label: "Auto-save recent recipients to contacts", section: "behavior", breadcrumb: "Behavior > Composing & Replies", keywords: ["auto save contacts", "recent recipients", "save contacts automatically", "address book"] },
  { label: "Reactions",            section: "behavior", breadcrumb: "Behavior > Composing & Replies", keywords: ["emoji reactions", "thumbs up"] },
  { label: "Protected Folders",    section: "behavior", breadcrumb: "Behavior > Password-protected folders", keywords: ["folder password", "lock folder", "folder lock mode", "unlock"] },
  { label: "Folder Lock Mode",     section: "behavior", breadcrumb: "Behavior > Password-protected folders", keywords: ["lock on leave", "unlocked for session"] },
  { label: "Cancellation Period",  section: "behavior", breadcrumb: "Behavior > Undo Send", keywords: ["undo send delay", "undo window", "seconds"] },
  { label: "Confirm Delete",       section: "behavior", breadcrumb: "Behavior > Confirmations", keywords: ["delete confirmation", "ask before delete"] },
  { label: "Confirm Archive",      section: "behavior", breadcrumb: "Behavior > Confirmations", keywords: ["archive confirmation", "ask before archive"] },
  { label: "Confirm Spam",         section: "behavior", breadcrumb: "Behavior > Confirmations", keywords: ["spam confirmation", "ask before spam"] },
  { label: "Enable Spam Filtering", section: "behavior", breadcrumb: "Behavior > Spam", keywords: ["spam filter", "junk filter", "spam sensitivity", "low medium high"] },

  // ── Security (privacy protections) ───────────────────────────────────────
  { label: "Enable Tracking Protection", section: "security", breadcrumb: "Security > Tracking Protection", keywords: ["tracker blocking", "privacy protection"] },
  { label: "Block Spy Pixels",     section: "security", breadcrumb: "Security > Tracking Protection", keywords: ["tracking pixel", "spy pixel", "1x1 pixel", "open tracking"] },
  { label: "Clean Tracking Links", section: "security", breadcrumb: "Security > Tracking Protection", keywords: ["utm", "link tracking", "strip parameters"] },
  { label: "Remote Image Loading", section: "security", breadcrumb: "Security > Content Protection", keywords: ["block remote images", "load images", "external images", "ask before loading"] },
  { label: "Block Remote Fonts",   section: "security", breadcrumb: "Security > Content Protection", keywords: ["external fonts", "web fonts"] },
  { label: "Block Remote CSS",     section: "security", breadcrumb: "Security > Content Protection", keywords: ["external stylesheets", "remote styles"] },
  { label: "Strip Image Metadata", section: "security", breadcrumb: "Security > Content Protection", keywords: ["exif", "metadata removal", "image privacy"] },
  { label: "Block HTML Rendering", section: "security", breadcrumb: "Security > Content Protection", keywords: ["plain text only", "disable html"] },
  { label: "App Lock",             section: "security", breadcrumb: "Security > App Lock", keywords: ["pin lock", "lock app", "pin code"] },
  { label: "Duress PIN",           section: "security", breadcrumb: "Security > Duress PIN", keywords: ["panic pin", "fake pin", "coercion"] },
  { label: "Aster Vanguard",       section: "security", breadcrumb: "Security > Vanguard", keywords: ["vanguard", "advanced protection", "lockdown", "lockdown mode"] },
  { label: "Login Alerts",         section: "security", breadcrumb: "Security > 2FA", keywords: ["new login notification", "sign-in alerts"] },
  { label: "External Link Warnings", section: "security", breadcrumb: "Security > Links", keywords: ["link warning", "suspicious links", "confirm links"] },

  // ── Mail Management (full coverage) ──────────────────────────────────────
  { label: "Vacation Reply",       section: "sender_filters", breadcrumb: "Mail Management > Vacation Reply", keywords: ["auto reply", "out of office", "ooo", "away message", "autoresponder"] },
  { label: "Auto-Forward",         section: "sender_filters", breadcrumb: "Mail Management > Auto-Forward", keywords: ["forwarding", "forward all mail", "redirect mail"] },
  { label: "External Accounts",    section: "sender_filters", breadcrumb: "Mail Management > External Accounts", keywords: ["connected accounts", "gmail sync", "fetch mail", "other mailbox"] },
  { label: "Export emails",        section: "sender_filters", breadcrumb: "Mail Management > Export", keywords: ["download mail", "backup emails", "mbox", "eml", "export contacts", "takeout"] },
  { label: "Subscription manager", section: "sender_filters", breadcrumb: "Mail Management > Subscriptions", keywords: ["unsubscribe", "newsletters", "mailing lists", "scan inbox"] },
  { label: "Folder auto-clean",    section: "sender_filters", breadcrumb: "Mail Management > Auto-clean", keywords: ["retention", "auto delete", "clean folder", "delete old emails", "expire emails"] },

  // ── Categories ───────────────────────────────────────────────────────────
  { label: "Inbox Categories",     section: "categories", breadcrumb: "Categories", keywords: ["tabs", "category tabs", "sort inbox", "primary", "promotions", "social"] },
  { label: "Custom Categories",    section: "categories", breadcrumb: "Categories > Custom", keywords: ["add category", "new category", "custom tab"] },

  // ── Aliases (ghost + directories) ────────────────────────────────────────
  { label: "Ghost Aliases",        section: "aliases", breadcrumb: "Aliases & Domains > Ghost Aliases", keywords: ["ghost mode", "expiring alias", "temporary email", "burner"] },
  { label: "Compose with Ghost Mode", section: "aliases", breadcrumb: "Aliases & Domains > Ghost Aliases", keywords: ["ghost compose", "anonymous send"] },
  { label: "Directories",          section: "aliases", breadcrumb: "Aliases & Domains > Directories", keywords: ["directory key", "auto-create aliases", "wildcard alias", "catch-all directory"] },
  { label: "Catch-all email address", section: "aliases", breadcrumb: "Aliases > Domains", keywords: ["catch all", "wildcard", "any address"] },

  // ── Billing (credits) ────────────────────────────────────────────────────
  { label: "Credits",              section: "billing", breadcrumb: "Billing > Credits", keywords: ["credit balance", "top up", "referral credits", "transactions", "use credits for renewals"] },

  // ── Developer (full coverage) ────────────────────────────────────────────
  { label: "Build Info",           section: "developer", breadcrumb: "Developer > Build Info", keywords: ["version", "release", "build number", "environment", "platform"] },
  { label: "Cryptographic Status", section: "developer", breadcrumb: "Developer > Crypto", keywords: ["vault", "fingerprint", "key age", "wkd", "keyserver", "kdf"] },
  { label: "Email Statistics",     section: "developer", breadcrumb: "Developer > Stats", keywords: ["total emails", "storage used", "unread count"] },
  { label: "Service Worker",       section: "developer", breadcrumb: "Developer > Performance", keywords: ["sw", "cache", "pwa", "offline"] },
];
