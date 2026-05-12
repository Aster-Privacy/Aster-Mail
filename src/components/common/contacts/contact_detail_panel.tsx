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

import { useEffect, useRef, useState } from "react";
import {
  TrashIcon,
  CameraIcon,
  EnvelopeIcon,
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  CakeIcon,
  CalendarIcon,
  UsersIcon,
  MapPinIcon,
  GlobeAltIcon,
  HashtagIcon,
  ClockIcon,
  StarIcon,
  PlusIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { ContactHistoryPanel } from "@/components/contacts/contact_history_panel";
import { show_toast } from "@/components/toast/simple_toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COLOR_SWATCHES: { key: string; value: string }[] = [
  { key: "red", value: "#e5484d" },
  { key: "orange", value: "#f5683a" },
  { key: "pink", value: "#f4a8c4" },
  { key: "yellow", value: "#f5c842" },
  { key: "green", value: "#30a46c" },
  { key: "blue", value: "#3e9eea" },
  { key: "indigo", value: "#3358d4" },
];

const DEFAULT_BANNER = "#3358d4";

interface ContactDetailPanelProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  selected_contact: DecryptedContact | null;
  show_history: boolean;
  set_show_history: (show: boolean) => void;
  copied_field: string | null;
  on_edit: (contact: DecryptedContact) => void;
  on_delete_request: (contact: DecryptedContact) => void;
  on_compose_email: (email: string) => void;
  on_copy: (text: string, field: string) => void;
  on_inline_save?: (
    contact: DecryptedContact,
    data: ContactFormData,
  ) => Promise<void> | void;
  on_inline_create?: (data: ContactFormData) => Promise<void> | void;
  on_cancel_create?: () => void;
  on_dismiss?: () => void;
  on_toggle_favorite?: (contact: DecryptedContact) => Promise<void> | void;
  is_creating_new?: boolean;
  is_submitting?: boolean;
}

interface EditState {
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

function to_email_entries(contact: DecryptedContact): EmailEntry[] {
  if (contact.email_entries && contact.email_entries.length > 0)
    return contact.email_entries;

  return (contact.emails || [])
    .filter(Boolean)
    .map((value) => ({ value, type: "other" as EmailEntryType }));
}

function to_phone_entries(contact: DecryptedContact): PhoneEntry[] {
  if (contact.phone_entries && contact.phone_entries.length > 0)
    return contact.phone_entries;
  if (contact.phone)
    return [{ value: contact.phone, type: "mobile" as PhoneEntryType }];

  return [];
}

function to_edit_state(contact: DecryptedContact): EditState {
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
    role: contact.role || "",
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
    address_entries: contact.address_entries || [],
    date_entries: contact.date_entries || [],
    related_people: contact.related_people || [],
    social_networks: contact.social_networks || [],
    websites: contact.websites || [],
    instant_messengers: contact.instant_messengers || [],
  };
}

function empty_edit_state(): EditState {
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

const FIELD_CLASS =
  "w-full h-11 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-edge-secondary/60 dark:border-transparent px-3.5 text-[14px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-blue-500/60 focus:bg-surf-primary dark:focus:bg-white/[0.06] transition-colors read-only:cursor-default";

const SELECT_CLASS =
  "h-11 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-edge-secondary/60 dark:border-transparent px-2.5 text-[13px] text-txt-primary focus:outline-none focus:border-blue-500/60 transition-colors disabled:cursor-default appearance-none";

const EMAIL_TYPE_OPTIONS: EmailEntryType[] = ["home", "work", "other"];
const PHONE_TYPE_OPTIONS: PhoneEntryType[] = [
  "mobile",
  "home",
  "work",
  "fax",
  "pager",
  "other",
];
const ADDRESS_TYPE_OPTIONS: AddressEntryType[] = ["home", "work", "other"];
const DATE_TYPE_OPTIONS: DateEntryType[] = [
  "anniversary",
  "graduation",
  "wedding",
  "other",
];
const RELATED_TYPE_OPTIONS: RelatedPersonType[] = [
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
const SOCIAL_TYPE_OPTIONS: SocialNetworkType[] = [
  "twitter",
  "linkedin",
  "github",
  "instagram",
  "facebook",
  "mastodon",
  "bluesky",
  "other",
];
const WEBSITE_TYPE_OPTIONS: WebsiteType[] = ["private", "work", "blog", "other"];
const IM_TYPE_OPTIONS: InstantMessengerType[] = [
  "signal",
  "matrix",
  "telegram",
  "whatsapp",
  "xmpp",
  "other",
];

function type_label_key(type: string): TranslationKey {
  return `common.type_${type}` as TranslationKey;
}

export function ContactDetailPanel({
  t,
  selected_contact,
  show_history,
  set_show_history,
  on_compose_email,
  on_delete_request,
  on_inline_save,
  on_inline_create,
  on_cancel_create,
  on_dismiss,
  on_toggle_favorite,
  is_creating_new,
  is_submitting,
}: ContactDetailPanelProps) {
  const [is_editing, set_is_editing] = useState(true);
  const [draft, set_draft] = useState<EditState | null>(null);
  const [show_more, set_show_more] = useState(false);
  const file_input_ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (is_creating_new) {
      set_draft(empty_edit_state());
      set_is_editing(true);
      set_show_more(true);

      return;
    }
    set_is_editing(true);
    set_show_more(false);
    set_draft(selected_contact ? to_edit_state(selected_contact) : null);
  }, [selected_contact?.id, is_creating_new]);

  if ((!selected_contact && !is_creating_new) || !draft) {
    return null;
  }

  const banner = draft.profile_color || DEFAULT_BANNER;

  const handle_save = async () => {
    const email_entries = draft.email_entries.filter((e) => e.value.trim());
    const phone_entries = draft.phone_entries.filter((p) => p.value.trim());
    const date_entries = draft.date_entries.filter((d) => d.value.trim());
    const related_people = draft.related_people.filter((r) => r.value.trim());
    const social_networks = draft.social_networks.filter((s) => s.value.trim());
    const websites = draft.websites.filter((w) => w.value.trim());
    const instant_messengers = draft.instant_messengers.filter((m) =>
      m.value.trim(),
    );
    const address_entries = draft.address_entries.filter(
      (a) =>
        (a.street || "").trim() ||
        (a.city || "").trim() ||
        (a.state || "").trim() ||
        (a.postal_code || "").trim() ||
        (a.country || "").trim(),
    );

    const base: ContactFormData = {
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      emails: email_entries.map((e) => e.value.trim()),
      phone: phone_entries[0]?.value.trim() || undefined,
      birthday: draft.birthday.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      profile_color: draft.profile_color,
      avatar_url: draft.avatar_url,
      is_favorite: selected_contact?.is_favorite ?? false,
      company: draft.company.trim() || undefined,
      job_title: selected_contact?.job_title,
      address: address_entries[0],
      social_links: selected_contact?.social_links,
      relationship: selected_contact?.relationship,
      groups: selected_contact?.groups,
      middle_name: draft.middle_name.trim() || undefined,
      title: draft.title.trim() || undefined,
      name_suffix: draft.name_suffix.trim() || undefined,
      phonetic_first_name: draft.phonetic_first_name.trim() || undefined,
      phonetic_middle_name: draft.phonetic_middle_name.trim() || undefined,
      phonetic_last_name: draft.phonetic_last_name.trim() || undefined,
      nickname: draft.nickname.trim() || undefined,
      role: draft.role.trim() || undefined,
      department: draft.department.trim() || undefined,
      comment: draft.comment.trim() || undefined,
      pronouns: draft.pronouns.trim() || undefined,
      email_entries,
      phone_entries,
      address_entries,
      date_entries,
      related_people,
      social_networks,
      websites,
      instant_messengers,
    };

    if (is_creating_new) {
      if (!on_inline_create) return;
      await on_inline_create(base);

      return;
    }

    if (!on_inline_save || !selected_contact) return;
    await on_inline_save(selected_contact, base);
    set_is_editing(false);
  };

  const handle_cancel = () => {
    if (is_creating_new) {
      on_cancel_create?.();

      return;
    }
    on_dismiss?.();
  };

  const handle_color_pick = (color: string) => {
    set_draft((d) => (d ? { ...d, profile_color: color } : d));
    if (!is_editing) set_is_editing(true);
  };

  const handle_avatar_file = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];

    if (file_input_ref.current) file_input_ref.current.value = "";
    if (!file) return;

    const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
    const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

    if (!ALLOWED_TYPES.includes(file.type)) {
      show_toast(t("common.unsupported_image_type"), "error");

      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      show_toast(t("common.image_too_large"), "error");

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const url = reader.result as string;

      set_draft((d) => (d ? { ...d, avatar_url: url } : d));
      if (!is_editing) set_is_editing(true);
    };
    reader.readAsDataURL(file);
  };

  const handle_avatar_clear = () => {
    set_draft((d) => (d ? { ...d, avatar_url: undefined } : d));
    if (!is_editing) set_is_editing(true);
  };

  const handle_field_change = (key: keyof EditState, value: string) => {
    set_draft((d) => (d ? { ...d, [key]: value } : d));
    if (!is_editing) set_is_editing(true);
  };

  const update_list = <K extends keyof EditState>(
    key: K,
    updater: (list: EditState[K]) => EditState[K],
  ) => {
    set_draft((d) => (d ? { ...d, [key]: updater(d[key]) } : d));
    if (!is_editing) set_is_editing(true);
  };

  return (
    <div
      className="flex flex-1 min-h-0 flex-col min-w-0 relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && is_editing) {
          e.preventDefault();
          handle_cancel();
        } else if (
          (e.key === "Enter" && (e.metaKey || e.ctrlKey)) &&
          is_editing
        ) {
          e.preventDefault();
          handle_save();
        }
      }}
    >
      <div className="flex-1 overflow-y-auto px-3 md:px-6 pt-6 pb-6 w-full">
        <div className="relative mb-14">
          <div
            className="h-[100px] rounded-2xl transition-colors"
            style={{ backgroundColor: banner }}
          />
          <div className="absolute -bottom-10 left-4">
            <div className="relative group">
              <ContactAvatar
                avatar_url={draft.avatar_url}
                className="ring-4 ring-surf-primary"
                email={draft.email_entries?.[0]?.value}
                name={`${draft.first_name || ""} ${draft.last_name || ""}`.trim()}
                profile_color={banner}
                rounded="rounded-2xl"
                size_px={92}
              />
              <button
                aria-label={t("common.upload")}
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 bg-black/40 flex items-center justify-center transition-opacity"
                onClick={() => file_input_ref.current?.click()}
              >
                <CameraIcon className="w-7 h-7 text-white" />
              </button>
              {draft.avatar_url && (
                <button
                  aria-label={t("common.delete")}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-black/80 hover:bg-black flex items-center justify-center ring-2 ring-surf-primary"
                  onClick={handle_avatar_clear}
                >
                  <TrashIcon className="w-3.5 h-3.5 text-white" />
                </button>
              )}
              <input
                ref={file_input_ref}
                accept="image/*"
                className="hidden"
                type="file"
                onChange={handle_avatar_file}
              />
            </div>
          </div>
          <div className="absolute right-4 -bottom-6 flex items-center gap-2 px-2.5 py-2 rounded-full bg-surf-primary border border-edge-primary shadow-lg">
            {COLOR_SWATCHES.map((c) => {
              const active = c.value === banner;

              return (
                <button
                  key={c.key}
                  aria-label={`${t("common.color")} ${c.key}`}
                  className="relative w-6 h-6 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    boxShadow: active ? "0 0 0 2px #ffffff" : "none",
                  }}
                  onClick={() => handle_color_pick(c.value)}
                />
              );
            })}
          </div>
        </div>

        {!is_creating_new && selected_contact && (
          <div className="flex items-center gap-2 mb-6">
            {selected_contact.emails[0] && (
              <button
                className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 text-[13px] font-medium text-txt-primary transition-colors"
                type="button"
                onClick={() => on_compose_email(selected_contact.emails[0])}
              >
                <EnvelopeIcon className="w-4 h-4" />
                {t("common.send_email")}
              </button>
            )}
            <button
              className={`flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-medium transition-colors ${show_history ? "bg-black/15 dark:bg-white/15 text-txt-primary" : "bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 text-txt-primary"}`}
              type="button"
              onClick={() => set_show_history(!show_history)}
            >
              <ClockIcon className="w-4 h-4" />
              {t("common.history")}
            </button>
            <button
              className="flex items-center gap-2 h-9 px-3.5 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 text-[13px] font-medium text-txt-primary transition-colors"
              type="button"
              onClick={() => on_toggle_favorite?.(selected_contact)}
            >
              {selected_contact.is_favorite ? (
                <StarSolidIcon className="w-4 h-4 text-yellow-500" />
              ) : (
                <StarIcon className="w-4 h-4" />
              )}
              {selected_contact.is_favorite
                ? t("common.favorited")
                : t("common.favorite")}
            </button>
          </div>
        )}

        {show_history && selected_contact ? (
          <ContactHistoryPanel contact_id={selected_contact.id} />
        ) : (
          <div className="space-y-10">
            <Section title={t("common.identity")}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.first_name_placeholder")}
                  readOnly={!is_editing}
                  value={draft.first_name}
                  onChange={(e) =>
                    handle_field_change("first_name", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.last_name_placeholder")}
                  readOnly={!is_editing}
                  value={draft.last_name}
                  onChange={(e) =>
                    handle_field_change("last_name", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.middle_name")}
                  readOnly={!is_editing}
                  value={draft.middle_name}
                  onChange={(e) =>
                    handle_field_change("middle_name", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.title")}
                  readOnly={!is_editing}
                  value={draft.title}
                  onChange={(e) =>
                    handle_field_change("title", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.name_suffix")}
                  readOnly={!is_editing}
                  value={draft.name_suffix}
                  onChange={(e) =>
                    handle_field_change("name_suffix", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.nickname")}
                  readOnly={!is_editing}
                  value={draft.nickname}
                  onChange={(e) =>
                    handle_field_change("nickname", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.pronouns")}
                  readOnly={!is_editing}
                  value={draft.pronouns}
                  onChange={(e) =>
                    handle_field_change("pronouns", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
              </div>
              <button
                className="flex items-center gap-1.5 text-[12px] text-txt-secondary hover:text-txt-primary transition-colors"
                type="button"
                onClick={() => set_show_more((v) => !v)}
              >
                {show_more ? (
                  <ChevronDownIcon className="w-4 h-4" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4" />
                )}
                {t("common.phonetic_first_name")}
              </button>
              {show_more && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className={FIELD_CLASS}
                    placeholder={t("common.phonetic_first_name")}
                    readOnly={!is_editing}
                    value={draft.phonetic_first_name}
                    onChange={(e) =>
                      handle_field_change("phonetic_first_name", e.target.value)
                    }
                    onFocus={() => set_is_editing(true)}
                  />
                  <input
                    className={FIELD_CLASS}
                    placeholder={t("common.phonetic_middle_name")}
                    readOnly={!is_editing}
                    value={draft.phonetic_middle_name}
                    onChange={(e) =>
                      handle_field_change(
                        "phonetic_middle_name",
                        e.target.value,
                      )
                    }
                    onFocus={() => set_is_editing(true)}
                  />
                  <input
                    className={FIELD_CLASS}
                    placeholder={t("common.phonetic_last_name")}
                    readOnly={!is_editing}
                    value={draft.phonetic_last_name}
                    onChange={(e) =>
                      handle_field_change("phonetic_last_name", e.target.value)
                    }
                    onFocus={() => set_is_editing(true)}
                  />
                </div>
              )}
            </Section>

            <Section title={t("common.communication")}>
              <div>
                <FieldLabel icon={EnvelopeIcon}>{t("common.email")}</FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.email_entries}
                  options={EMAIL_TYPE_OPTIONS}
                  placeholder="name@example.com"
                  t={t}
                  type_default="other"
                  on_add={() =>
                    update_list("email_entries", (l) => [
                      ...l,
                      { value: "", type: "other" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("email_entries", (l) =>
                      l.map((e, i) => (i === idx ? { ...e, value } : e)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("email_entries", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("email_entries", (l) =>
                      l.map((e, i) =>
                        i === idx ? { ...e, type: type as EmailEntryType } : e,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <FieldLabel icon={PhoneIcon}>{t("common.phone")}</FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.phone_entries}
                  options={PHONE_TYPE_OPTIONS}
                  placeholder="XXX-XXX-XXXX"
                  t={t}
                  type_default="mobile"
                  on_add={() =>
                    update_list("phone_entries", (l) => [
                      ...l,
                      { value: "", type: "mobile" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("phone_entries", (l) =>
                      l.map((p, i) => (i === idx ? { ...p, value } : p)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("phone_entries", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("phone_entries", (l) =>
                      l.map((p, i) =>
                        i === idx ? { ...p, type: type as PhoneEntryType } : p,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <FieldLabel icon={ChatBubbleLeftRightIcon}>
                  {t("common.instant_messengers")}
                </FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.instant_messengers}
                  options={IM_TYPE_OPTIONS}
                  placeholder={t("common.username")}
                  t={t}
                  type_default="signal"
                  on_add={() =>
                    update_list("instant_messengers", (l) => [
                      ...l,
                      { value: "", type: "signal" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("instant_messengers", (l) =>
                      l.map((m, i) => (i === idx ? { ...m, value } : m)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("instant_messengers", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("instant_messengers", (l) =>
                      l.map((m, i) =>
                        i === idx
                          ? { ...m, type: type as InstantMessengerType }
                          : m,
                      ),
                    )
                  }
                />
              </div>
            </Section>

            <Section title={t("common.work")}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.role")}
                  readOnly={!is_editing}
                  value={draft.role}
                  onChange={(e) =>
                    handle_field_change("role", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.department")}
                  readOnly={!is_editing}
                  value={draft.department}
                  onChange={(e) =>
                    handle_field_change("department", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.company")}
                  readOnly={!is_editing}
                  value={draft.company}
                  onChange={(e) =>
                    handle_field_change("company", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
                <input
                  className={FIELD_CLASS}
                  placeholder={t("common.comment")}
                  readOnly={!is_editing}
                  value={draft.comment}
                  onChange={(e) =>
                    handle_field_change("comment", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
              </div>
            </Section>

            <Section title={t("common.personal")}>
              <div>
                <FieldLabel icon={CakeIcon}>
                  {t("common.birthday")}
                </FieldLabel>
                <input
                  className={FIELD_CLASS}
                  placeholder="MM/DD/YYYY"
                  readOnly={!is_editing}
                  type={is_editing ? "date" : "text"}
                  value={draft.birthday}
                  onChange={(e) =>
                    handle_field_change("birthday", e.target.value)
                  }
                  onFocus={() => set_is_editing(true)}
                />
              </div>
              <div>
                <FieldLabel icon={CalendarIcon}>
                  {t("common.dates")}
                </FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.date_entries}
                  input_type="date"
                  options={DATE_TYPE_OPTIONS}
                  placeholder="YYYY-MM-DD"
                  t={t}
                  type_default="anniversary"
                  on_add={() =>
                    update_list("date_entries", (l) => [
                      ...l,
                      { value: "", type: "anniversary" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("date_entries", (l) =>
                      l.map((d, i) => (i === idx ? { ...d, value } : d)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("date_entries", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("date_entries", (l) =>
                      l.map((d, i) =>
                        i === idx
                          ? { ...d, type: type as DateEntryType }
                          : d,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <FieldLabel icon={UsersIcon}>
                  {t("common.related_people")}
                </FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.related_people}
                  options={RELATED_TYPE_OPTIONS}
                  placeholder={t("common.name")}
                  t={t}
                  type_default="assistant"
                  on_add={() =>
                    update_list("related_people", (l) => [
                      ...l,
                      { value: "", type: "assistant" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("related_people", (l) =>
                      l.map((r, i) => (i === idx ? { ...r, value } : r)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("related_people", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("related_people", (l) =>
                      l.map((r, i) =>
                        i === idx
                          ? { ...r, type: type as RelatedPersonType }
                          : r,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <FieldLabel icon={MapPinIcon}>
                  {t("common.address")}
                </FieldLabel>
                <AddressList
                  disabled={!is_editing}
                  entries={draft.address_entries}
                  t={t}
                  on_add={() =>
                    update_list("address_entries", (l) => [
                      ...l,
                      { type: "home" },
                    ])
                  }
                  on_change={(idx, patch) =>
                    update_list("address_entries", (l) =>
                      l.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("address_entries", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                />
              </div>
            </Section>

            <Section title={t("common.web_security")}>
              <div>
                <FieldLabel icon={GlobeAltIcon}>
                  {t("common.websites")}
                </FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.websites}
                  options={WEBSITE_TYPE_OPTIONS}
                  placeholder="https://example.com"
                  t={t}
                  type_default="private"
                  on_add={() =>
                    update_list("websites", (l) => [
                      ...l,
                      { value: "", type: "private" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("websites", (l) =>
                      l.map((w, i) => (i === idx ? { ...w, value } : w)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("websites", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("websites", (l) =>
                      l.map((w, i) =>
                        i === idx ? { ...w, type: type as WebsiteType } : w,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <FieldLabel icon={HashtagIcon}>
                  {t("common.social_networks")}
                </FieldLabel>
                <TypedList
                  disabled={!is_editing}
                  entries={draft.social_networks}
                  options={SOCIAL_TYPE_OPTIONS}
                  placeholder="@handle"
                  t={t}
                  type_default="twitter"
                  on_add={() =>
                    update_list("social_networks", (l) => [
                      ...l,
                      { value: "", type: "twitter" },
                    ])
                  }
                  on_change={(idx, value) =>
                    update_list("social_networks", (l) =>
                      l.map((s, i) => (i === idx ? { ...s, value } : s)),
                    )
                  }
                  on_remove={(idx) =>
                    update_list("social_networks", (l) =>
                      l.filter((_, i) => i !== idx),
                    )
                  }
                  on_type_change={(idx, type) =>
                    update_list("social_networks", (l) =>
                      l.map((s, i) =>
                        i === idx
                          ? { ...s, type: type as SocialNetworkType }
                          : s,
                      ),
                    )
                  }
                />
              </div>
            </Section>

            <Section title={t("common.notes")}>
              <textarea
                className="w-full min-h-[120px] rounded-xl bg-black/20 dark:bg-white/[0.04] border border-transparent px-3.5 py-3 text-[14px] text-txt-primary placeholder:text-txt-muted resize-none focus:outline-none focus:border-blue-500/60 transition-colors"
                placeholder={t("common.notes_placeholder")}
                readOnly={!is_editing}
                value={draft.notes}
                onChange={(e) => handle_field_change("notes", e.target.value)}
                onFocus={() => set_is_editing(true)}
              />
            </Section>
          </div>
        )}
      </div>

      <div className="border-t border-edge-primary bg-surf-primary">
        <div className="px-3 md:px-6 py-3 flex items-center justify-between">
        {is_creating_new || !selected_contact ? (
          <span />
        ) : (
          <Button
            className="h-9 px-4 text-[13px] !bg-red-500 hover:!bg-red-600 !text-white !border-transparent"
            onClick={() => on_delete_request(selected_contact)}
          >
            {t("common.delete_contact")}
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button
            className="h-9 px-4 text-[13px]"
            variant="outline"
            onClick={handle_cancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="h-9 px-4 text-[13px]"
            disabled={is_submitting}
            onClick={handle_save}
          >
            {t("common.save")}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <h2 className="text-[15px] font-semibold text-txt-primary pb-2 border-b border-edge-primary">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function FieldLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-3.5 h-3.5 text-txt-muted" />
      <p className="text-[12px] tracking-wide text-txt-secondary font-medium">
        {children}
      </p>
    </div>
  );
}

interface TypedListProps<T extends string> {
  entries: { value: string; type: T }[];
  options: T[];
  placeholder: string;
  input_type?: string;
  type_default: T;
  disabled: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_add: () => void;
  on_change: (idx: number, value: string) => void;
  on_remove: (idx: number) => void;
  on_type_change: (idx: number, type: string) => void;
}

function TypedList<T extends string>({
  entries,
  options,
  placeholder,
  input_type,
  disabled,
  t,
  on_add,
  on_change,
  on_remove,
  on_type_change,
}: TypedListProps<T>) {
  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            className={`${FIELD_CLASS} flex-1 min-w-0`}
            placeholder={placeholder}
            readOnly={disabled}
            type={input_type || "text"}
            value={entry.value}
            onChange={(e) => on_change(idx, e.target.value)}
          />
          <Select
            disabled={disabled}
            value={entry.type}
            onValueChange={(v) => on_type_change(idx, v)}
          >
            <SelectTrigger className="w-[120px] h-11 rounded-xl bg-black/20 dark:bg-white/[0.04] border-transparent text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {t(type_label_key(opt))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!disabled && (
            <button
              aria-label={t("common.remove")}
              className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
              type="button"
              onClick={() => on_remove(idx)}
            >
              <XMarkIcon className="w-4 h-4 text-txt-muted" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-edge-primary bg-black/10 dark:bg-white/[0.04] text-[12px] text-txt-secondary hover:text-txt-primary hover:bg-black/20 dark:hover:bg-white/[0.08] transition-colors"
          type="button"
          onClick={on_add}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {entries.length === 0 ? t("common.add") : t("common.add_more")}
        </button>
      )}
    </div>
  );
}

interface AddressListProps {
  entries: AddressEntry[];
  disabled: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_add: () => void;
  on_change: (idx: number, patch: Partial<AddressEntry>) => void;
  on_remove: (idx: number) => void;
}

function AddressList({
  entries,
  disabled,
  t,
  on_add,
  on_change,
  on_remove,
}: AddressListProps) {
  return (
    <div className="space-y-3">
      {entries.map((entry, idx) => (
        <div
          key={idx}
          className="rounded-xl bg-black/10 dark:bg-white/[0.02] p-3 space-y-2 relative"
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <select
                className={`${SELECT_CLASS} pr-7 w-full`}
                disabled={disabled}
                value={entry.type}
                onChange={(e) =>
                  on_change(idx, {
                    type: e.target.value as AddressEntryType,
                  })
                }
              >
                {ADDRESS_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {t(type_label_key(opt))}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-txt-muted" />
            </div>
            {!disabled && (
              <button
                aria-label={t("common.remove")}
                className="flex-shrink-0 w-8 h-8 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
                type="button"
                onClick={() => on_remove(idx)}
              >
                <XMarkIcon className="w-4 h-4 text-txt-muted" />
              </button>
            )}
          </div>
          <input
            className={FIELD_CLASS}
            placeholder={t("common.address_placeholder")}
            readOnly={disabled}
            value={entry.street || ""}
            onChange={(e) => on_change(idx, { street: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={FIELD_CLASS}
              placeholder={t("common.city_placeholder")}
              readOnly={disabled}
              value={entry.city || ""}
              onChange={(e) => on_change(idx, { city: e.target.value })}
            />
            <input
              className={FIELD_CLASS}
              placeholder={t("common.state_placeholder")}
              readOnly={disabled}
              value={entry.state || ""}
              onChange={(e) => on_change(idx, { state: e.target.value })}
            />
            <input
              className={FIELD_CLASS}
              placeholder={t("common.postal_code_placeholder")}
              readOnly={disabled}
              value={entry.postal_code || ""}
              onChange={(e) =>
                on_change(idx, { postal_code: e.target.value })
              }
            />
            <input
              className={FIELD_CLASS}
              placeholder={t("common.country_placeholder")}
              readOnly={disabled}
              value={entry.country || ""}
              onChange={(e) => on_change(idx, { country: e.target.value })}
            />
          </div>
        </div>
      ))}
      {!disabled && (
        <button
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-edge-primary bg-black/10 dark:bg-white/[0.04] text-[12px] text-txt-secondary hover:text-txt-primary hover:bg-black/20 dark:hover:bg-white/[0.08] transition-colors"
          type="button"
          onClick={on_add}
        >
          <PlusIcon className="w-3.5 h-3.5" />
          {entries.length === 0 ? t("common.add") : t("common.add_more")}
        </button>
      )}
    </div>
  );
}
