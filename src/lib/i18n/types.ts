export type LanguageCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt"
  | "pt-BR"
  | "zh-CN"
  | "zh-TW"
  | "ja"
  | "ko"
  | "ar"
  | "ru"
  | "hi"
  | "nl"
  | "pl"
  | "tr"
  | "sv"
  | "no"
  | "da"
  | "fi"
  | "cs"
  | "uk"
  | "th"
  | "vi"
  | "id"
  | "ms"
  | "he";

export interface Language {
  code: LanguageCode;
  name: string;
  native_name: string;
  direction: "ltr" | "rtl";
  region?: string;
}

export interface TranslationNamespace {
  common: CommonTranslations;
  settings: SettingsTranslations;
  mail: MailTranslations;
  auth: AuthTranslations;
  errors: ErrorTranslations;
}

export interface CommonTranslations {
  app_name: string;
  loading: string;
  save: string;
  cancel: string;
  delete: string;
  edit: string;
  create: string;
  search: string;
  close: string;
  confirm: string;
  back: string;
  next: string;
  previous: string;
  done: string;
  yes: string;
  no: string;
  ok: string;
  retry: string;
  refresh: string;
  copy: string;
  copied: string;
  download: string;
  upload: string;
  export: string;
  import: string;
  select_all: string;
  deselect_all: string;
  no_results: string;
  show_more: string;
  show_less: string;
  contacts: string;
  invite_friends: string;
  send_feedback: string;
  folders: string;
  more: string;
  mail: string;
}

export interface SettingsTranslations {
  title: string;
  general: string;
  account: string;
  appearance: string;
  security: string;
  security_description: string;
  notifications: string;
  preferences: string;
  compose: string;
  templates: string;
  feedback: string;
  feedback_description: string;
  language: string;
  language_description: string;
  theme: string;
  theme_description: string;
  theme_light: string;
  theme_dark: string;
  theme_auto: string;
  email_address: string;
  email_address_description: string;
  display_name: string;
  display_name_description: string;
  signature: string;
  signature_description: string;
  signature_disabled: string;
  signature_enabled: string;
  signature_custom: string;
  custom_signature: string;
  time_zone: string;
  time_zone_description: string;
  date_format: string;
  date_format_description: string;
  density: string;
  density_description: string;
  density_comfortable: string;
  density_compact: string;
  auto_save_drafts: string;
  auto_save_drafts_description: string;
  desktop_notifications: string;
  desktop_notifications_description: string;
  email_notifications: string;
  email_notifications_description: string;
  sound: string;
  sound_description: string;
  two_factor_auth: string;
  two_factor_auth_description: string;
  encryption_keys: string;
  encryption_keys_description: string;
  end_to_end_encryption: string;
  always_on: string;
  key_fingerprint: string;
  export_keys: string;
  recovery_codes: string;
  changes_saved_automatically: string;
  reset: string;
  behavior: string;
  behavior_description: string;
  developer: string;
  developer_description: string;
  billing: string;
  billing_description: string;
  undo_send: string;
  undo_send_description: string;
  blocked: string;
  blocked_description: string;
}

export interface MailTranslations {
  inbox: string;
  sent: string;
  drafts: string;
  starred: string;
  archive: string;
  spam: string;
  trash: string;
  scheduled: string;
  compose: string;
  reply: string;
  reply_all: string;
  forward: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  from: string;
  date: string;
  attachments: string;
  no_subject: string;
  no_messages: string;
  unread: string;
  mark_as_read: string;
  mark_as_unread: string;
  move_to: string;
  label: string;
  select_recipients: string;
  send: string;
  send_later: string;
  discard: string;
  save_draft: string;
  attachment_add: string;
  attachment_remove: string;
}

export interface AuthTranslations {
  sign_in: string;
  sign_out: string;
  sign_up: string;
  email: string;
  password: string;
  confirm_password: string;
  forgot_password: string;
  reset_password: string;
  remember_me: string;
  create_account: string;
  already_have_account: string;
  dont_have_account: string;
  terms_of_service: string;
  privacy_policy: string;
  agree_terms: string;
  username: string;
  sign_in_to_aster: string;
  enter_credentials: string;
  signing_in: string;
  keep_signed_in: string;
  secure_devices_only: string;
  back_to_inbox: string;
  enter_password_placeholder: string;
  authenticating: string;
  fetching_auth_data: string;
  verifying_credentials: string;
  decrypting_vault: string;
  getting_user_info: string;
}

export interface ErrorTranslations {
  generic: string;
  network: string;
  unauthorized: string;
  not_found: string;
  validation: string;
  server: string;
  timeout: string;
  rate_limit: string;
  invalid_credentials: string;
  session_expired: string;
  try_again: string;
  invalid_username: string;
  enter_password: string;
  password_too_long: string;
  account_not_found: string;
  login_failed: string;
  decrypt_failed: string;
}

export type TranslationKey =
  | `common.${keyof CommonTranslations}`
  | `settings.${keyof SettingsTranslations}`
  | `mail.${keyof MailTranslations}`
  | `auth.${keyof AuthTranslations}`
  | `errors.${keyof ErrorTranslations}`;

export type Translations = TranslationNamespace;
