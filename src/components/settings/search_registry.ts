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
import type { TranslationKey } from "@/lib/i18n/types";
import type { SettingsSection } from "@/components/settings/settings_content";

export interface SearchEntry {
  label: string;
  label_key?: TranslationKey;
  section: SettingsSection;
  breadcrumb: string;
  crumb_key?: TranslationKey;
  keywords?: string[];
}

// Add one entry here when adding a new setting to any section.
// label     - the exact name shown in the UI
// section   - which settings panel tab it lives in
// breadcrumb - human path shown in the search result (e.g. "Security > 2FA")
// keywords  - optional extra terms (abbreviations, synonyms)
export const SETTINGS_SEARCH_REGISTRY: SearchEntry[] = [
  // ── Appearance ───────────────────────────────────────────────────────────
  { label: "Dark",                      label_key: "settings.theme_dark", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["dark mode", "night mode", "theme"] },
  { label: "Light",                     label_key: "settings.theme_light", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["light mode", "theme"] },
  { label: "System",                    label_key: "settings.theme_system", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["system theme", "auto theme", "match device"] },
  { label: "Sync theme across devices", label_key: "settings.theme_sync_across_devices", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["theme sync", "per device theme", "device theme", "separate theme"] },
  { label: "Theme colors",              label_key: "settings.custom_theme_colors_title", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["color theme", "purple", "green", "rose", "orange", "teal", "indigo", "amber", "cyan", "slate", "aster blue", "blue", "lime", "fuchsia", "magenta", "emerald", "pink", "black", "dark", "oled", "accent color"] },
  { label: "Custom theme",         label_key: "settings.custom_theme_title", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["custom color", "palette", "seed color", "custom palette", "starplan", "premium theme"] },
  { label: "Font",                 label_key: "settings.font_choice_title", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["font switcher", "typeface", "font family", "starplan"] },
  { label: "Email font",           label_key: "settings.email_font_choice_title", section: "appearance", breadcrumb: "Appearance > Theme", crumb_key: "settings_search.theme", keywords: ["monospace", "mono", "message font", "reading font", "email typeface", "courier"] },
  { label: "Density",                   label_key: "settings.density", section: "appearance", breadcrumb: "Appearance > Layout", crumb_key: "settings_search.layout", keywords: ["layout density", "compact", "comfortable", "cozy"] },
  { label: "Language",             label_key: "settings_search.language", section: "appearance", breadcrumb: "Appearance > Language", crumb_key: "settings_search.language", keywords: ["locale", "region"] },
  { label: "Date Format",          label_key: "settings.date_format", section: "appearance", breadcrumb: "Appearance > Language & format", crumb_key: "settings_search.language_and_format" },
  { label: "Time format",          label_key: "settings.time_format", section: "appearance", breadcrumb: "Appearance > Language & format", crumb_key: "settings_search.language_and_format", keywords: ["12 hour", "24 hour", "clock"] },
  { label: "Time Zone",            label_key: "settings.time_zone", section: "appearance", breadcrumb: "Appearance > Language & format", crumb_key: "settings_search.language_and_format", keywords: ["timezone", "utc", "region", "local time"] },

  // ── Account ──────────────────────────────────────────────────────────────
  { label: "Display name",              label_key: "settings.alias_display_name_label", section: "account", breadcrumb: "Account > Profile", crumb_key: "settings_search.profile", keywords: ["change name", "username", "handle", "profile photo", "avatar", "picture", "change photo"] },
  { label: "Recovery email",       label_key: "common.recovery_email_label", section: "account", breadcrumb: "Account > Security", crumb_key: "settings_search.security" },
  { label: "Session Timeout",           label_key: "settings.session_timeout", section: "security", breadcrumb: "Security > Session", crumb_key: "settings_search.session", keywords: ["auto-logout", "auto logout", "inactivity timeout", "sign out automatically"] },
  { label: "Delete account",            label_key: "common.delete_account", section: "security", breadcrumb: "Security > Danger Zone", crumb_key: "settings_search.danger_zone", keywords: ["close account", "remove account"] },

  // ── Accessibility ─────────────────────────────────────────────────────────
  { label: "Font size",            label_key: "common.font_size_label", section: "accessibility", breadcrumb: "Accessibility > Text", crumb_key: "settings_search.text", keywords: ["text size", "larger text"] },
  { label: "Reduce Motion",        label_key: "settings.reduce_motion", section: "accessibility", breadcrumb: "Accessibility > Animations", crumb_key: "settings_search.animations", keywords: ["animations", "transitions"] },
  { label: "High Contrast",        label_key: "settings.high_contrast", section: "accessibility", breadcrumb: "Accessibility > Display", crumb_key: "settings_search.display" },

  // ── Security ──────────────────────────────────────────────────────────────
  { label: "Change password",      label_key: "common.change_password_label", section: "security", breadcrumb: "Security > Password", crumb_key: "settings_search.password", keywords: ["reset password", "update password"] },
  { label: "Two-factor authentication", label_key: "settings.criterion_two_factor", section: "security", breadcrumb: "Security > 2FA", crumb_key: "settings_search.two_factor", keywords: ["2fa", "totp", "authenticator app", "otp", "google authenticator", "two factor"] },
  { label: "Passkeys",                  label_key: "settings_search.passkeys", section: "security", breadcrumb: "Security > Passkeys", crumb_key: "settings_search.passkeys", keywords: ["fido", "webauthn", "biometric", "face id", "touch id", "fingerprint", "hardware security keys", "yubikey", "fido2", "security key", "usb key", "rename passkey", "rename hardware key"] },
  { label: "Backup Codes",         label_key: "settings.backup_codes", section: "security", breadcrumb: "Security > Recovery", crumb_key: "settings_search.recovery", keywords: ["recovery codes", "one-time codes"] },
  { label: "Account Recovery",     label_key: "settings_search.account_recovery", section: "security", breadcrumb: "Security > Account Recovery", crumb_key: "settings_search.account_recovery", keywords: ["restore account", "forgot password", "recovery methods"] },
  { label: "Recovery codes",       label_key: "settings.feature_recovery_codes", section: "security", breadcrumb: "Security > Account Recovery", crumb_key: "settings_search.account_recovery", keywords: ["regenerate codes", "backup codes", "recovery phrase", "one-time codes"] },
  { label: "Recover older data",   label_key: "settings.recover_older_data_title", section: "security", breadcrumb: "Security > Account Recovery", crumb_key: "settings_search.account_recovery", keywords: ["old password", "unlock older data", "restore old mail", "resurrection"] },
  { label: "Active sessions",      label_key: "settings_search.active_sessions", section: "security", breadcrumb: "Security > Sessions", crumb_key: "settings_search.sessions", keywords: ["sign out all devices", "logout everywhere", "login history"] },
  { label: "Review security",           label_key: "settings.account_security_review_cta", section: "security", breadcrumb: "Security > Checkup", crumb_key: "settings_search.checkup", keywords: ["security checkup", "protection score", "account protection"] },

  // ── Encryption ────────────────────────────────────────────────────────────
  { label: "Export Public Key",         label_key: "settings.export_public_key_label", section: "encryption", breadcrumb: "Encryption > Keys", crumb_key: "settings_search.keys", keywords: ["download public key", "share public key", "key algorithm", "ecc", "curve25519", "rsa", "algorithm"] },
  { label: "Export Private Key",        label_key: "settings.export_private_key_label", section: "encryption", breadcrumb: "Encryption > Keys", crumb_key: "settings_search.keys", keywords: ["download private key", "backup private key", "import key", "upload key", "restore key"] },
  { label: "Rotate Keys Now",           label_key: "settings.rotate_keys_now", section: "security", breadcrumb: "Security > Key Rotation", crumb_key: "settings_search.key_rotation", keywords: ["rotate encryption key", "key rotation", "new key", "regenerate key"] },
  { label: "Recovery codes",       label_key: "settings.feature_recovery_codes", section: "encryption", breadcrumb: "Encryption > Recovery", crumb_key: "settings_search.recovery", keywords: ["regenerate codes", "backup codes"] },
  { label: "Storage format",       label_key: "settings.storage_format_title", section: "encryption", breadcrumb: "Encryption > Storage", crumb_key: "settings_search.storage" },
  { label: "Hide subject on encrypted mail", label_key: "settings.obscure_subject_title", section: "encryption", breadcrumb: "Encryption > Control", crumb_key: "settings_search.control", keywords: ["obscure subject", "protected headers", "encrypted subject", "hide subject"] },

  // ── Trusted Devices ───────────────────────────────────────────────────────
  { label: "Trusted Devices",      label_key: "settings.trusted_devices", section: "trusted_devices", breadcrumb: "Trusted Devices" },
  { label: "Revoke",                    label_key: "settings.trusted_devices_revoke", section: "trusted_devices", breadcrumb: "Trusted Devices > Device", crumb_key: "settings_search.device", keywords: ["revoke device", "remove device", "untrust"] },
  { label: "Sign out all other sessions", label_key: "settings.sign_out_all_other", section: "security", breadcrumb: "Security > Sessions", crumb_key: "settings_search.sessions", keywords: ["sign out device", "log out other devices", "sign out everywhere"] },

  // ── Aliases & Domains ─────────────────────────────────────────────────────
  { label: "Create Alias",         label_key: "settings.create_alias", section: "aliases", breadcrumb: "Aliases > Create", crumb_key: "settings_search.create" },
  { label: "Custom domain",        label_key: "settings_search.custom_domain", section: "aliases", breadcrumb: "Aliases > Domains", crumb_key: "settings_search.domains", keywords: ["add domain", "domain setup"] },
  { label: "Buy a domain",         label_key: "settings.domain_purchase_banner_cta", section: "aliases", breadcrumb: "Aliases > Domains", crumb_key: "settings_search.domains", keywords: ["purchase domain", "register domain", "domain search", "new domain"] },
  { label: "Verify All Records",        label_key: "settings.verify_all_records", section: "aliases", breadcrumb: "Aliases > Domains", crumb_key: "settings_search.domains", keywords: ["domain verification", "verify domain", "dns setup"] },
  { label: "DNS records",          label_key: "settings_search.dns_records", section: "aliases", breadcrumb: "Aliases > Domains", crumb_key: "settings_search.domains", keywords: ["mx record", "dkim", "spf", "dmarc"] },
  { label: "Delete Alias",         label_key: "common.delete_alias", section: "aliases", breadcrumb: "Aliases > Manage", crumb_key: "settings_search.manage", keywords: ["remove alias", "deactivate alias"] },

  // ── Ghost Aliases ─────────────────────────────────────────────────────────

  // ── Billing ───────────────────────────────────────────────────────────────
  { label: "Current Plan",         label_key: "settings.current_plan", section: "billing", breadcrumb: "Billing > Plan", crumb_key: "settings_search.plan" },
  { label: "Manage Plan",               label_key: "settings.manage_plan", section: "billing", breadcrumb: "Billing > Plan", crumb_key: "settings_search.plan", keywords: ["upgrade plan", "upgrade", "change plan", "pro", "star", "supernova"] },
  { label: "Cancel Subscription",  label_key: "settings.cancel_subscription", section: "billing", breadcrumb: "Billing > Plan", crumb_key: "settings_search.plan", keywords: ["cancel", "downgrade"] },
  { label: "Payment method",       label_key: "settings_search.payment_method", section: "billing", breadcrumb: "Billing > Payment", crumb_key: "settings_search.payment", keywords: ["credit card", "add card", "update card"] },
  { label: "Billing History",      label_key: "settings.billing_history", section: "billing", breadcrumb: "Billing > Invoices", crumb_key: "settings_search.invoices", keywords: ["invoices", "receipts", "past payments"] },
  { label: "Storage add-on",       label_key: "settings_search.storage_add_on", section: "billing", breadcrumb: "Billing > Add-ons", crumb_key: "settings_search.add_ons", keywords: ["buy storage", "extra storage", "more space"] },

  // ── Referral ──────────────────────────────────────────────────────────────
  { label: "Your referral link",        label_key: "settings.your_referral_link", section: "referral", breadcrumb: "Referral > Code", crumb_key: "settings_search.code", keywords: ["referral code", "invite code", "share code"] },
  { label: "Copy Link",                 label_key: "settings.copy_link", section: "referral", breadcrumb: "Referral", keywords: ["invite a friend", "refer", "share"] },

  // ── Import ────────────────────────────────────────────────────────────────
  { label: "Gmail",                     label_key: "settings.gmail_import", section: "import", breadcrumb: "Import > Gmail", crumb_key: "settings_search.gmail", keywords: ["import from gmail", "google import", "migrate gmail"] },
  { label: "Outlook",                   label_key: "settings.outlook_import", section: "import", breadcrumb: "Import > Outlook", crumb_key: "settings_search.outlook", keywords: ["import from outlook", "microsoft import", "migrate outlook"] },
  { label: "Manual Import",             label_key: "settings.manual_import", section: "import", breadcrumb: "Import > IMAP", crumb_key: "settings_search.imap", keywords: ["import from imap", "imap import", "pop3 import", "migrate imap", "mbox", "eml", "proton", "protonmail"] },

  // ── Bridge ────────────────────────────────────────────────────────────────
  { label: "Aster Bridge",              label_key: "settings.bridge_app_name", section: "bridge", breadcrumb: "Bridge > Download", crumb_key: "settings_search.download", keywords: ["download bridge", "installer", "desktop bridge", "thunderbird", "apple mail", "mac mail"] },
  { label: "SMTP, IMAP, POP3 & JMAP",   label_key: "settings.smtp_tokens", section: "bridge", breadcrumb: "Bridge > Configuration", crumb_key: "settings_search.configuration", keywords: ["smtp settings", "smtp server", "smtp port", "outgoing mail", "imap settings", "imap server", "imap port", "incoming mail", "pop3", "jmap"] },
  { label: "Connect Apple Mail",   label_key: "settings_search.connect_apple_mail", section: "bridge", breadcrumb: "Bridge > Setup", crumb_key: "settings_search.setup", keywords: ["apple mail setup", "mac mail"] },

  // ── Notifications ─────────────────────────────────────────────────────────
  { label: "Push Notifications",   label_key: "common.push_notifications", section: "notifications", breadcrumb: "Notifications > Push", crumb_key: "settings_search.push", keywords: ["enable notifications", "disable notifications"] },
  { label: "Desktop Notifications", label_key: "settings.desktop_notifications", section: "notifications", breadcrumb: "Notifications > Desktop", crumb_key: "settings_search.desktop" },
  { label: "Sound",                     label_key: "settings.sound", section: "notifications", breadcrumb: "Notifications > Sound", crumb_key: "settings_search.sound", keywords: ["notification sound", "audio", "chime", "play sound"] },
  { label: "Unread badge",              label_key: "settings.badge_count_setting", section: "notifications", breadcrumb: "Notifications > Badge", crumb_key: "settings_search.badge", keywords: ["badge count", "app icon badge", "unread count"] },
  { label: "Notification Position", label_key: "settings.toast_position", section: "notifications", breadcrumb: "Notifications > Position", crumb_key: "settings_search.position", keywords: ["toast position", "popup position", "top right", "bottom right", "top left", "bottom left"] },

  // ── Signature ─────────────────────────────────────────────────────────────
  { label: "Add Signature",        label_key: "settings.add_signature", section: "signature", breadcrumb: "Signature > Create", crumb_key: "settings_search.create" },
  { label: "Signature Mode",            label_key: "settings.signature_mode", section: "signature", breadcrumb: "Signature > Edit", crumb_key: "settings_search.edit", keywords: ["edit signature", "signature mode", "html signature", "rich text", "plain text signature", "automatic", "manual"] },

  // ── Templates ─────────────────────────────────────────────────────────────
  { label: "Create Template",      label_key: "settings.create_template", section: "templates", breadcrumb: "Templates > Create", crumb_key: "settings_search.create", keywords: ["new template", "add template"] },
  { label: "Email Templates",           label_key: "settings.email_templates_title", section: "templates", breadcrumb: "Templates > Manage", crumb_key: "settings_search.manage", keywords: ["manage templates", "edit template", "delete template"] },

  // ── Behavior ──────────────────────────────────────────────────────────────
  { label: "Reading pane",         label_key: "settings_search.reading_pane", section: "behavior", breadcrumb: "Behavior > Layout", crumb_key: "settings_search.layout", keywords: ["preview pane", "split view"] },
  { label: "Settings view",        label_key: "settings.settings_view_mode", section: "behavior", breadcrumb: "Behavior > Advanced", crumb_key: "settings_search.advanced", keywords: ["settings popup", "settings full screen", "settings window", "open settings"] },
  { label: "Undo send",            label_key: "settings.feature_undo_send", section: "behavior", breadcrumb: "Behavior > Sending", crumb_key: "settings_search.sending", keywords: ["unsend", "recall email"] },
  { label: "Mark as read",         label_key: "settings.family_filters_action_mark_read", section: "behavior", breadcrumb: "Behavior > Reading", crumb_key: "settings_search.reading" },
  { label: "After Archiving or Deleting", label_key: "settings.auto_advance", section: "behavior", breadcrumb: "Behavior > Reading", crumb_key: "settings_search.reading", keywords: ["auto advance", "next email", "open next", "auto open"] },
  { label: "Swipe Actions",        label_key: "settings.swipe_actions", section: "behavior", breadcrumb: "Behavior > Swipe", crumb_key: "settings_search.swipe", keywords: ["swipe gesture"] },

  // ── Sender Filters ───────────────────────────────────────────────────────
  { label: "Block sender",         label_key: "settings.alias_pref_unsubscribe_block_contact", section: "sender_filters", breadcrumb: "Mail Management > Block", crumb_key: "settings_search.block", keywords: ["blocklist", "ban sender"] },
  { label: "Allowlist",            label_key: "settings_search.allowlist", section: "sender_filters", breadcrumb: "Mail Management > Allowlist", crumb_key: "settings_search.allowlist", keywords: ["whitelist", "safe senders", "trusted senders"] },

  // ── Mail Rules ───────────────────────────────────────────────────────────
  { label: "Create rule",          label_key: "mail_rules.create_rule", section: "mail_rules", breadcrumb: "Mail Rules > Create", crumb_key: "settings_search.create", keywords: ["add rule", "new filter"] },
  { label: "Auto label",           label_key: "settings_search.auto_label", section: "mail_rules", breadcrumb: "Mail Rules > Actions", crumb_key: "settings_search.actions", keywords: ["automatic label", "tag email"] },
  { label: "Auto archive",         label_key: "settings_search.auto_archive", section: "mail_rules", breadcrumb: "Mail Rules > Actions", crumb_key: "settings_search.actions", keywords: ["automatic archive"] },
  { label: "Auto forward",         label_key: "settings_search.auto_forward", section: "mail_rules", breadcrumb: "Mail Rules > Actions", crumb_key: "settings_search.actions", keywords: ["automatic forward"] },
  { label: "Move to folder",       label_key: "mail.move_to_folder", section: "mail_rules", breadcrumb: "Mail Rules > Actions", crumb_key: "settings_search.actions" },

  // ── SMTP Tokens ──────────────────────────────────────────────────────────
  { label: "Generate token",            label_key: "settings.smtp_token_generate", section: "bridge", breadcrumb: "Bridge > Tokens", crumb_key: "settings_search.tokens", keywords: ["smtp token", "smtp password", "app password", "create token", "revoke smtp token", "delete token", "remove token"] },

  // ── Feedback ─────────────────────────────────────────────────────────────
  { label: "Your Feedback",             label_key: "settings.your_feedback", section: "feedback", breadcrumb: "Feedback > Bug Report", crumb_key: "settings_search.bug_report", keywords: ["report a bug", "bug report", "submit bug", "feature request", "suggest feature", "request feature"] },
  { label: "Other Ways to Reach Us",    label_key: "settings.other_ways_to_reach", section: "feedback", breadcrumb: "Feedback > Support", crumb_key: "settings_search.support", keywords: ["contact support", "get help", "support ticket"] },

  // ── Developer ─────────────────────────────────────────────────────────────
  { label: "Developer Mode",            label_key: "settings.developer_mode", section: "behavior", breadcrumb: "Behavior > Advanced", crumb_key: "settings_search.advanced", keywords: ["dev mode", "debug mode"] },
  { label: "Network",                   label_key: "settings.network", section: "developer", breadcrumb: "Developer > Logs", crumb_key: "settings_search.logs", keywords: ["request logs", "api logs", "connectivity"] },

  // ── Updates ──────────────────────────────────────────────────────────────
  { label: "Check for updates",    label_key: "settings.updates_check_now", section: "updates", breadcrumb: "Updates" },
  { label: "Auto-update",          label_key: "settings_search.auto_update", section: "updates", breadcrumb: "Updates > Settings", crumb_key: "settings_search.settings", keywords: ["automatic updates", "update automatically"] },
  { label: "Release notes",        label_key: "settings.updates_release_notes", section: "updates", breadcrumb: "Updates > Changelog", crumb_key: "settings_search.changelog", keywords: ["changelog", "what's new"] },

  // ── Family ───────────────────────────────────────────────────────────────
  { label: "Invite Member",             label_key: "settings.family_invite_member", section: "family", breadcrumb: "Family > Invite", crumb_key: "settings_search.invite", keywords: ["invite family member", "add member"] },
  { label: "Members",                   label_key: "settings.fam_org_tab_members", section: "family", breadcrumb: "Family > Members", crumb_key: "settings_search.members", keywords: ["manage family members", "family members"] },
  { label: "Kids",                      label_key: "settings.fam_kids_tab", section: "family", breadcrumb: "Family > Children", crumb_key: "settings_search.children", keywords: ["children's accounts", "kids account", "child account"] },

  // ── Appearance (view modes) ──────────────────────────────────────────────
  { label: "Email view mode",      label_key: "settings.email_view_mode", section: "appearance", breadcrumb: "Appearance > Layout", crumb_key: "settings_search.layout", keywords: ["popup", "split view", "full page", "open email", "reading layout"] },
  { label: "Compose window mode",  label_key: "settings.compose_window_mode", section: "appearance", breadcrumb: "Appearance > Layout", crumb_key: "settings_search.layout", keywords: ["floating popup", "full screen compose", "minimized compose", "compose layout"] },

  // ── Accessibility (full coverage) ────────────────────────────────────────
  { label: "Reduce Transparency",  label_key: "settings.reduce_transparency", section: "accessibility", breadcrumb: "Accessibility > Vision", crumb_key: "settings_search.vision", keywords: ["transparency", "blur", "opaque"] },
  { label: "Underline Links",      label_key: "settings.underline_links", section: "accessibility", breadcrumb: "Accessibility > Vision", crumb_key: "settings_search.vision", keywords: ["links", "underline"] },
  { label: "Dyslexia-Friendly Font", label_key: "settings.dyslexia_friendly_font", section: "accessibility", breadcrumb: "Accessibility > Reading", crumb_key: "settings_search.reading", keywords: ["dyslexia", "opendyslexic", "readable font"] },
  { label: "Text Spacing",         label_key: "settings.text_spacing", section: "accessibility", breadcrumb: "Accessibility > Reading", crumb_key: "settings_search.reading", keywords: ["letter spacing", "line height", "spacing"] },
  { label: "Compact Mode",         label_key: "settings.compact_mode", section: "accessibility", breadcrumb: "Accessibility > Motion & Layout", crumb_key: "settings_search.motion_and_layout", keywords: ["density", "spacing", "more content"] },
  { label: "Enable shortcuts",          label_key: "common.enable_shortcuts", section: "accessibility", breadcrumb: "Accessibility > Keyboard Shortcuts", crumb_key: "settings_search.keyboard_shortcuts", keywords: ["keyboard shortcuts", "hotkeys", "keybindings", "keyboard navigation", "screen reader", "accessibility"] },
  { label: "Keyboard Shortcuts",        label_key: "common.keyboard_shortcuts", section: "accessibility", breadcrumb: "Accessibility > Keyboard Shortcuts", crumb_key: "settings_search.keyboard_shortcuts", keywords: ["shortcut list", "hotkey list", "view all shortcuts"] },
  { label: "Low Network Mode",     label_key: "settings.low_network_mode_label", section: "accessibility", breadcrumb: "Accessibility > Performance", crumb_key: "settings_search.performance", keywords: ["network", "performance", "slow connection", "metered", "data saver", "plain text", "bandwidth", "offline"] },

  // ── Account (full coverage) ──────────────────────────────────────────────
  { label: "Primary address",      label_key: "settings.primary_address_label", section: "account", breadcrumb: "Account > Profile", crumb_key: "settings_search.profile", keywords: ["email address", "main address"] },
  { label: "Inactivity window",    label_key: "common.inactivity_window", section: "account", breadcrumb: "Account > Session", crumb_key: "settings_search.session", keywords: ["auto logout", "session timeout", "inactivity"] },
  { label: "Reset all settings",   label_key: "common.reset_all_settings", section: "account", breadcrumb: "Account > Advanced", crumb_key: "settings_search.advanced", keywords: ["defaults", "restore defaults", "factory reset"] },

  // ── Notifications (full coverage) ────────────────────────────────────────
  { label: "Quiet Hours",          label_key: "settings_search.quiet_hours", section: "notifications", breadcrumb: "Notifications > Quiet Hours", crumb_key: "settings_search.quiet_hours", keywords: ["do not disturb", "dnd", "silence", "schedule", "mute hours"] },
  { label: "Notification Duration", label_key: "settings.toast_duration", section: "notifications", breadcrumb: "Notifications > Duration", crumb_key: "settings_search.duration", keywords: ["toast duration", "popup duration", "how long"] },
  { label: "New emails",           label_key: "settings.new_emails", section: "notifications", breadcrumb: "Notifications > Events", crumb_key: "settings_search.events", keywords: ["notify new mail", "incoming mail alert"] },
  { label: "Replies",              label_key: "settings.replies", section: "notifications", breadcrumb: "Notifications > Events", crumb_key: "settings_search.events", keywords: ["reply notifications"] },
  { label: "Send test notification", label_key: "settings.send_test_notification", section: "notifications", breadcrumb: "Notifications > Test", crumb_key: "settings_search.test", keywords: ["test notification", "try notification"] },
  { label: "Muted categories",     label_key: "settings.muted_categories", section: "notifications", breadcrumb: "Notifications > Categories", crumb_key: "settings.categories_title", keywords: ["mute category", "silence category", "deals", "social", "notifications tab", "promotions", "updates"] },

  // ── Behavior (full coverage) ─────────────────────────────────────────────
  { label: "Translate incoming mail", label_key: "settings.translate_incoming", section: "behavior", breadcrumb: "Behavior > Translation", crumb_key: "settings_search.translation", keywords: ["translation", "translate", "language", "bergamot"] },
  { label: "Languages you read",   label_key: "settings.translate_my_languages", section: "behavior", breadcrumb: "Behavior > Translation", crumb_key: "settings_search.translation", keywords: ["known languages", "no translate"] },
  { label: "Never translate",      label_key: "settings.translate_never_languages", section: "behavior", breadcrumb: "Behavior > Translation", crumb_key: "settings_search.translation", keywords: ["skip translation", "exclude language"] },
  { label: "Conversation Grouping",     label_key: "settings.conversation_grouping", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", crumb_key: "settings_search.reading_and_conversations", keywords: ["thread", "thread view", "group emails", "group by thread", "conversation view", "threading"] },
  { label: "Conversation Order",   label_key: "settings.conversation_order", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", crumb_key: "settings_search.reading_and_conversations", keywords: ["oldest first", "newest first", "thread order"] },
  { label: "Thread count badge position", label_key: "settings.thread_count_position", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", crumb_key: "settings_search.reading_and_conversations", keywords: ["thread count", "badge position"] },
  { label: "Reading pane position", label_key: "settings.reading_pane_position", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", crumb_key: "settings_search.reading_and_conversations", keywords: ["preview pane", "right side", "bottom", "hidden"] },
  { label: "Show Message Size",    label_key: "settings.show_message_size", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", crumb_key: "settings_search.reading_and_conversations", keywords: ["email size", "message size", "kb", "mb"] },
  { label: "Force Dark Mode for Emails", label_key: "settings.force_dark_mode_emails", section: "behavior", breadcrumb: "Behavior > Reading & Conversations", crumb_key: "settings_search.reading_and_conversations", keywords: ["dark emails", "invert email", "dark mode email"] },
  { label: "Sidebar Width",        label_key: "settings.sidebar_width", section: "behavior", breadcrumb: "Behavior > Navigation Panel", crumb_key: "settings_search.navigation_panel", keywords: ["sidebar size", "panel width"] },
  { label: "Minimize Sidebar",     label_key: "settings.minimize_sidebar", section: "behavior", breadcrumb: "Behavior > Navigation Panel", crumb_key: "settings_search.navigation_panel", keywords: ["collapse sidebar", "hide sidebar"] },
  { label: "Default Reply",        label_key: "settings.default_reply", section: "behavior", breadcrumb: "Behavior > Composing & Replies", crumb_key: "settings_search.composing_and_replies", keywords: ["reply all", "reply to sender"] },
  { label: "Auto-save recent recipients to contacts", label_key: "settings.auto_save_recipients_to_contacts", section: "behavior", breadcrumb: "Behavior > Composing & Replies", crumb_key: "settings_search.composing_and_replies", keywords: ["auto save contacts", "recent recipients", "save contacts automatically", "address book"] },
  { label: "Reactions",            label_key: "settings.reactions_enabled", section: "behavior", breadcrumb: "Behavior > Composing & Replies", crumb_key: "settings_search.composing_and_replies", keywords: ["emoji reactions", "thumbs up"] },
  { label: "Purge Protected Folder Contents", label_key: "settings.purge_locked_folder_on_delete", section: "behavior", breadcrumb: "Behavior > Composing & Replies", crumb_key: "settings_search.composing_and_replies", keywords: ["purge folder", "destroy mail", "delete protected folder", "permanent delete"] },
  { label: "Protected Folders",    label_key: "settings.protected_folders", section: "behavior", breadcrumb: "Behavior > Password-protected folders", crumb_key: "settings_search.password_protected_folders", keywords: ["folder password", "lock folder", "folder lock mode", "unlock"] },
  { label: "Folder Lock Mode",     label_key: "settings.folder_lock_mode", section: "behavior", breadcrumb: "Behavior > Password-protected folders", crumb_key: "settings_search.password_protected_folders", keywords: ["lock on leave", "unlocked for session"] },
  { label: "Cancellation Period",       label_key: "settings.cancellation_period", section: "behavior", breadcrumb: "Behavior > Undo Send", crumb_key: "settings_search.undo_send", keywords: ["undo send delay", "undo window", "seconds", "send delay", "delay send", "scheduled send"] },
  { label: "Confirm Delete",       label_key: "settings.confirm_delete", section: "behavior", breadcrumb: "Behavior > Confirmations", crumb_key: "settings_search.confirmations", keywords: ["delete confirmation", "ask before delete"] },
  { label: "Confirm Archive",      label_key: "settings.confirm_archive", section: "behavior", breadcrumb: "Behavior > Confirmations", crumb_key: "settings_search.confirmations", keywords: ["archive confirmation", "ask before archive"] },
  { label: "Confirm Spam",         label_key: "settings.confirm_spam", section: "behavior", breadcrumb: "Behavior > Confirmations", crumb_key: "settings_search.confirmations", keywords: ["spam confirmation", "ask before spam"] },
  { label: "Enable Spam Filtering",     label_key: "settings.spam_filter_enabled", section: "behavior", breadcrumb: "Behavior > Spam", crumb_key: "settings_search.spam", keywords: ["spam filter", "junk filter", "junk mail", "spam settings", "spam sensitivity", "low medium high"] },

  // ── Security (privacy protections) ───────────────────────────────────────
  { label: "Enable Tracking Protection", label_key: "settings.tracking_protection_enabled", section: "security", breadcrumb: "Security > Tracking Protection", crumb_key: "settings_search.tracking_protection", keywords: ["tracker blocking", "privacy protection"] },
  { label: "Block Spy Pixels",     label_key: "settings.block_spy_pixels", section: "security", breadcrumb: "Security > Tracking Protection", crumb_key: "settings_search.tracking_protection", keywords: ["tracking pixel", "spy pixel", "1x1 pixel", "open tracking"] },
  { label: "Clean Tracking Links", label_key: "settings.block_tracking_links", section: "security", breadcrumb: "Security > Tracking Protection", crumb_key: "settings_search.tracking_protection", keywords: ["utm", "link tracking", "strip parameters"] },
  { label: "Remote Image Loading", label_key: "settings.remote_image_loading", section: "security", breadcrumb: "Security > Content Protection", crumb_key: "settings_search.content_protection", keywords: ["block remote images", "load images", "external images", "ask before loading"] },
  { label: "Block Remote Fonts",   label_key: "settings.block_remote_fonts_label", section: "security", breadcrumb: "Security > Content Protection", crumb_key: "settings_search.content_protection", keywords: ["external fonts", "web fonts"] },
  { label: "Block Remote CSS",     label_key: "settings.block_remote_css_label", section: "security", breadcrumb: "Security > Content Protection", crumb_key: "settings_search.content_protection", keywords: ["external stylesheets", "remote styles"] },
  { label: "Strip Image Metadata", label_key: "settings.strip_exif_on_compose_label", section: "security", breadcrumb: "Security > Content Protection", crumb_key: "settings_search.content_protection", keywords: ["exif", "metadata removal", "image privacy"] },
  { label: "Block HTML Rendering", label_key: "settings.html_rendering_mode_label", section: "security", breadcrumb: "Security > Content Protection", crumb_key: "settings_search.content_protection", keywords: ["plain text only", "disable html"] },
  { label: "App Lock",             label_key: "settings_search.app_lock", section: "security", breadcrumb: "Security > App Lock", crumb_key: "settings_search.app_lock", keywords: ["pin lock", "lock app", "pin code"] },
  { label: "Duress PIN",           label_key: "settings_search.duress_pin", section: "security", breadcrumb: "Security > Duress PIN", crumb_key: "settings_search.duress_pin", keywords: ["panic pin", "fake pin", "coercion"] },
  { label: "Aster Vanguard",       label_key: "settings.plan_feat_vanguard", section: "security", breadcrumb: "Security > Vanguard", crumb_key: "settings_search.vanguard", keywords: ["vanguard", "advanced protection", "lockdown", "lockdown mode"] },
  { label: "Login Alerts",         label_key: "settings.info_login_alerts_title", section: "security", breadcrumb: "Security > 2FA", crumb_key: "settings_search.two_factor", keywords: ["new login notification", "sign-in alerts"] },
  { label: "External Link Warnings", label_key: "settings.external_link_warnings", section: "security", breadcrumb: "Security > Links", crumb_key: "settings_search.links", keywords: ["link warning", "suspicious links", "confirm links"] },

  // ── Mail Management (full coverage) ──────────────────────────────────────
  { label: "Vacation Reply",       label_key: "settings_search.vacation_reply", section: "sender_filters", breadcrumb: "Mail Management > Vacation Reply", crumb_key: "settings_search.vacation_reply", keywords: ["auto reply", "out of office", "ooo", "away message", "autoresponder"] },
  { label: "Auto-Forward",              label_key: "settings.auto_forward_tab_label", section: "sender_filters", breadcrumb: "Mail Management > Auto forward", crumb_key: "settings_search.auto_forward", keywords: ["forwarding", "email forwarding", "forward email", "forward all mail", "redirect mail"] },
  { label: "External Accounts",    label_key: "settings_search.external_accounts", section: "sender_filters", breadcrumb: "Mail Management > External Accounts", crumb_key: "settings_search.external_accounts", keywords: ["connected accounts", "gmail sync", "fetch mail", "other mailbox"] },
  { label: "Export emails",             label_key: "settings.export_title", section: "sender_filters", breadcrumb: "Mail Management > Export", crumb_key: "settings_search.export", keywords: ["download mail", "backup emails", "mbox", "eml", "export contacts", "takeout", "subscription manager", "unsubscribe", "newsletters", "mailing lists"] },
  { label: "Add auto-clean",            label_key: "folder_retention.add", section: "mail_rules", breadcrumb: "Mail Rules > Auto-clean", crumb_key: "settings_search.auto_clean", keywords: ["folder auto-clean", "retention", "auto delete", "clean folder", "delete old emails", "expire emails", "older than"] },

  // ── Categories ───────────────────────────────────────────────────────────
  { label: "Inbox Categories",     label_key: "settings.inbox_categories", section: "categories", breadcrumb: "Categories", keywords: ["tabs", "category tabs", "sort inbox", "primary", "promotions", "social"] },
  { label: "Custom Categories",    label_key: "settings.custom_categories_title", section: "categories", breadcrumb: "Categories > Custom", crumb_key: "settings_search.custom", keywords: ["add category", "new category", "custom tab"] },

  // ── Aliases (ghost + directories) ────────────────────────────────────────
  { label: "Ghost Aliases",             label_key: "settings_search.ghost_aliases", section: "aliases", breadcrumb: "Aliases & Domains > Ghost Aliases", crumb_key: "settings_search.ghost_aliases", keywords: ["ghost mode", "expiring alias", "temporary email", "burner", "create ghost alias", "burn address", "anonymous address", "masked email", "hide email", "anonymous email", "disposable"] },
  { label: "Compose with Ghost Mode", label_key: "settings.ghost_aliases_compose_cta", section: "aliases", breadcrumb: "Aliases & Domains > Ghost Aliases", crumb_key: "settings_search.ghost_aliases", keywords: ["ghost compose", "anonymous send"] },
  { label: "Directories",          label_key: "settings_search.directories", section: "aliases", breadcrumb: "Aliases & Domains > Directories", crumb_key: "settings_search.directories", keywords: ["directory key", "auto-create aliases", "wildcard alias", "catch-all directory"] },
  { label: "Catch-all",                 label_key: "settings.catch_all_label", section: "aliases", breadcrumb: "Aliases > Domains", crumb_key: "settings_search.domains", keywords: ["catch-all email address", "catch all", "wildcard", "any address"] },

  // ── Billing (credits) ────────────────────────────────────────────────────
  { label: "Credits",              label_key: "settings_search.credits", section: "billing", breadcrumb: "Billing > Credits", crumb_key: "settings_search.credits", keywords: ["credit balance", "top up", "referral credits", "transactions", "use credits for renewals"] },

  // ── Developer (full coverage) ────────────────────────────────────────────
  { label: "Build Info",           label_key: "settings_search.build_info", section: "developer", breadcrumb: "Developer > Build Info", crumb_key: "settings_search.build_info", keywords: ["version", "release", "build number", "environment", "platform"] },
  { label: "Cryptographic Status", label_key: "settings.crypto_status", section: "developer", breadcrumb: "Developer > Crypto", crumb_key: "settings_search.crypto", keywords: ["vault", "fingerprint", "key age", "wkd", "keyserver", "kdf"] },
  { label: "Email Statistics",     label_key: "settings.email_statistics", section: "developer", breadcrumb: "Developer > Stats", crumb_key: "settings_search.stats", keywords: ["total emails", "storage used", "unread count"] },
  { label: "Service Worker",       label_key: "settings.service_worker", section: "developer", breadcrumb: "Developer > Performance", crumb_key: "settings_search.performance", keywords: ["sw", "cache", "pwa", "offline"] },
];
