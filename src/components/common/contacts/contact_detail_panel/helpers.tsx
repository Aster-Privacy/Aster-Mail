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
import type {
  ContactRevision,
  DecryptedContact,
  ContactFormData,
  EmailEntry,
  PhoneEntry,
  AddressEntry,
  DateEntry,
  RelatedPersonEntry,
  SocialNetworkEntry,
  WebsiteEntry,
  InstantMessengerEntry,
  EmailEntryType,
  PhoneEntryType,
  AddressEntryType,
  DateEntryType,
  RelatedPersonType,
  SocialNetworkType,
  WebsiteType,
  InstantMessengerType,
} from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n";

export const COLOR_SWATCHES: { key: string; value: string }[] = [
  { key: "red", value: "#e5484d" },
  { key: "orange", value: "#f5683a" },
  { key: "pink", value: "#f4a8c4" },
  { key: "yellow", value: "#f5c842" },
  { key: "green", value: "#30a46c" },
  { key: "blue", value: "#3e9eea" },
  { key: "indigo", value: "#3358d4" },
];

export const DEFAULT_BANNER = "#3358d4";

export interface ContactDetailPanelProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  selected_contact: DecryptedContact | null;
  show_history: boolean;
  set_show_history: (show: boolean) => void;
  on_edit: (contact: DecryptedContact) => void;
  on_delete_request: (contact: DecryptedContact) => void;
  on_compose_email: (email: string) => void;
  on_search_mail?: (query: string) => void;
  on_copy: (text: string, field: string) => void | Promise<boolean | void>;
  on_inline_save?: (
    contact: DecryptedContact,
    data: ContactFormData,
  ) => Promise<boolean | void> | boolean | void;
  on_inline_create?: (data: ContactFormData) => Promise<void> | void;
  on_cancel_create?: () => void;
  on_dismiss?: () => void;
  on_share_via_email?: (file: File) => void;
  on_toggle_favorite?: (contact: DecryptedContact) => Promise<void> | void;
  on_undo_change?: (
    contact: DecryptedContact,
    revision: ContactRevision,
  ) => Promise<void> | void;
  on_toggle_group?: (
    contact: DecryptedContact,
    group_id: string,
    should_add: boolean,
  ) => Promise<void> | void;
  is_creating_new?: boolean;
  is_submitting?: boolean;
}

export interface EditState {
  first_name: string;
  last_name: string;
  middle_name: string;
  title: string;
  name_suffix: string;
  phonetic_first_name: string;
  phonetic_middle_name: string;
  phonetic_last_name: string;
  nickname: string;
  role: string;
  department: string;
  company: string;
  comment: string;
  pronouns: string;
  birthday: string;
  notes: string;
  profile_color: string;
  avatar_url?: string;
  email_entries: EmailEntry[];
  phone_entries: PhoneEntry[];
  address_entries: AddressEntry[];
  date_entries: DateEntry[];
  related_people: RelatedPersonEntry[];
  social_networks: SocialNetworkEntry[];
  websites: WebsiteEntry[];
  instant_messengers: InstantMessengerEntry[];
}

export function to_email_entries(contact: DecryptedContact): EmailEntry[] {
  if (contact.email_entries && contact.email_entries.length > 0)
    return normalize_typed_entries(contact.email_entries, EMAIL_TYPE_OPTIONS);

  return (contact.emails || [])
    .filter(Boolean)
    .map((value) => ({ value, type: "other" as EmailEntryType }));
}

export function to_phone_entries(contact: DecryptedContact): PhoneEntry[] {
  if (contact.phone_entries && contact.phone_entries.length > 0)
    return normalize_typed_entries(contact.phone_entries, PHONE_TYPE_OPTIONS);
  if (contact.phone)
    return [{ value: contact.phone, type: "mobile" as PhoneEntryType }];

  return [];
}

export function to_address_entries(contact: DecryptedContact): AddressEntry[] {
  if (contact.address_entries && contact.address_entries.length > 0) {
    return normalize_typed_entries(
      contact.address_entries,
      ADDRESS_TYPE_OPTIONS,
    );
  }
  const address = contact.address;

  if (
    address &&
    typeof address === "object" &&
    [
      address.street,
      address.city,
      address.state,
      address.postal_code,
      address.country,
    ].some((part) => (part || "").trim())
  ) {
    return [{ ...address, type: "home" }];
  }

  return [];
}

export function to_edit_state(contact: DecryptedContact): EditState {
  return {
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    middle_name: contact.middle_name || "",
    title: contact.title || "",
    name_suffix: contact.name_suffix || "",
    phonetic_first_name: contact.phonetic_first_name || "",
    phonetic_middle_name: contact.phonetic_middle_name || "",
    phonetic_last_name: contact.phonetic_last_name || "",
    nickname: contact.nickname || "",
    role: contact.role || contact.job_title || "",
    department: contact.department || "",
    company: contact.company || "",
    comment: contact.comment || "",
    pronouns: contact.pronouns || "",
    birthday: contact.birthday || "",
    notes: contact.notes || "",
    profile_color: contact.profile_color || DEFAULT_BANNER,
    avatar_url: contact.avatar_url,
    email_entries: to_email_entries(contact),
    phone_entries: to_phone_entries(contact),
    address_entries: to_address_entries(contact),
    date_entries: contact.date_entries || [],
    related_people: contact.related_people || [],
    social_networks: contact.social_networks || [],
    websites: contact.websites || [],
    instant_messengers: contact.instant_messengers || [],
  };
}

export function empty_edit_state(): EditState {
  return {
    first_name: "",
    last_name: "",
    middle_name: "",
    title: "",
    name_suffix: "",
    phonetic_first_name: "",
    phonetic_middle_name: "",
    phonetic_last_name: "",
    nickname: "",
    role: "",
    department: "",
    company: "",
    comment: "",
    pronouns: "",
    birthday: "",
    notes: "",
    profile_color: DEFAULT_BANNER,
    avatar_url: undefined,
    email_entries: [],
    phone_entries: [],
    address_entries: [],
    date_entries: [],
    related_people: [],
    social_networks: [],
    websites: [],
    instant_messengers: [],
  };
}

export const FIELD_CLASS =
  "w-full h-11 rounded-[var(--aster-radius-field)] bg-[var(--aster-field-bg)] px-3.5 text-[14px] text-txt-primary placeholder:text-txt-muted outline-none transition-[background-color,box-shadow] hover:bg-[var(--aster-field-hover)] focus:bg-[var(--aster-field-bg)] focus:shadow-[inset_0_0_0_2px_var(--accent-color)] read-only:cursor-default";

export const SELECT_CLASS =
  "h-11 rounded-[var(--aster-radius-field)] bg-[var(--aster-field-bg)] px-3.5 text-[13px] text-txt-primary outline-none transition-[background-color,box-shadow] hover:bg-[var(--aster-field-hover)] focus:shadow-[inset_0_0_0_2px_var(--accent-color)] disabled:cursor-default appearance-none";

export const EMAIL_TYPE_OPTIONS: EmailEntryType[] = [
  "home",
  "personal",
  "work",
  "other",
];
export const PHONE_TYPE_OPTIONS: PhoneEntryType[] = [
  "mobile",
  "home",
  "personal",
  "work",
  "fax",
  "pager",
  "other",
];
export const ADDRESS_TYPE_OPTIONS: AddressEntryType[] = [
  "home",
  "work",
  "other",
];
export const DATE_TYPE_OPTIONS: DateEntryType[] = [
  "anniversary",
  "graduation",
  "wedding",
  "other",
];
export const RELATED_TYPE_OPTIONS: RelatedPersonType[] = [
  "assistant",
  "manager",
  "spouse",
  "partner",
  "child",
  "parent",
  "sibling",
  "friend",
  "other",
];
export const SOCIAL_TYPE_OPTIONS: SocialNetworkType[] = [
  "twitter",
  "linkedin",
  "github",
  "instagram",
  "facebook",
  "mastodon",
  "bluesky",
  "other",
];
export const WEBSITE_TYPE_OPTIONS: WebsiteType[] = [
  "private",
  "work",
  "blog",
  "other",
];
export const IM_TYPE_OPTIONS: InstantMessengerType[] = [
  "signal",
  "matrix",
  "telegram",
  "whatsapp",
  "xmpp",
  "other",
];

export function format_address_lines(entry: AddressEntry): string[] {
  return [
    entry.street,
    [entry.city, entry.state].filter(Boolean).join(" "),
    entry.postal_code,
    entry.country,
  ]
    .map((part) => (part || "").trim())
    .filter(Boolean);
}

export function type_label_key(type: string): TranslationKey {
  return `common.type_${type}` as TranslationKey;
}

export const CUSTOM_TYPE = "custom";

export function next_address_type(
  entries: { type: string }[],
): AddressEntryType {
  if (!entries.some((entry) => entry.type === "home")) return "home";
  if (!entries.some((entry) => entry.type === "work")) return "work";

  return "other";
}

export function entry_select_value(
  entry: { type: string; label?: string },
  options: readonly string[],
): string {
  if (entry.type === "other" && entry.label !== undefined) return CUSTOM_TYPE;
  if (!options.includes(entry.type)) {
    return entry.label !== undefined ? CUSTOM_TYPE : "other";
  }

  return entry.type;
}

export function entry_type_text(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  entry: { type?: string; label?: string },
  options: readonly string[],
): string {
  const label = (entry.label ?? "").trim();

  if (label) return label;
  const type =
    entry.type && options.includes(entry.type) ? entry.type : "other";

  return t(type_label_key(type));
}

export function normalize_typed_entries<
  E extends { type: string; label?: string },
>(entries: E[], options: readonly string[]): E[] {
  return entries.map((entry) => {
    if (options.includes(entry.type)) return entry;
    const kept = (entry.label ?? "").trim();
    const raw = (entry.type ?? "").trim().toLowerCase();
    const label =
      kept || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "");

    return (
      label ? { ...entry, type: "other", label } : { ...entry, type: "other" }
    ) as E;
  });
}
