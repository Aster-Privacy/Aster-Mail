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
import type { DecryptedContact } from "@/types/contacts";
import type { EditState } from "./helpers";
import type { TranslationKey } from "@/lib/i18n";
import type { ReactNode } from "react";

import {
  AtSymbolIcon,
  BriefcaseIcon,
  CakeIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  LinkIcon,
  MapPinIcon,
  PhoneIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { format_address_lines, type_label_key } from "./helpers";

import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { parse_calendar_date } from "@/utils/date_utils";

interface ContactViewProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  contact: DecryptedContact;
  draft: EditState;
  group_names: Record<string, string>;
  on_copy: (text: string, field: string) => void | Promise<boolean | void>;
}

interface DetailRow {
  key: string;
  icon: ReactNode;
  lines: { key: string; text: string; href?: string; label?: string }[];
}

function format_date_label(value: string): string {
  const parsed = parse_calendar_date(value);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function normalize_url(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function ContactView({
  t,
  contact,
  draft,
  group_names,
  on_copy,
}: ContactViewProps) {
  const display_name =
    `${draft.first_name} ${draft.middle_name} ${draft.last_name}`
      .replace(/\s+/g, " ")
      .trim() ||
    draft.email_entries[0]?.value ||
    t("common.unnamed");

  const subtitle_parts = [draft.role, draft.department, draft.company].filter(
    Boolean,
  );

  const group_chips = (contact.groups ?? [])
    .map((id) => ({ id, name: group_names[id] }))
    .filter((group): group is { id: string; name: string } =>
      Boolean(group.name),
    );

  const rows: DetailRow[] = [];

  const emails = draft.email_entries.filter((entry) => entry.value.trim());

  if (emails.length > 0) {
    rows.push({
      key: "email",
      icon: <EnvelopeIcon className="h-[18px] w-[18px]" />,
      lines: emails.map((entry, index) => ({
        key: `email_${index}`,
        text: entry.value,
        href: `mailto:${entry.value}`,
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  const phones = draft.phone_entries.filter((entry) => entry.value.trim());

  if (phones.length > 0) {
    rows.push({
      key: "phone",
      icon: <PhoneIcon className="h-[18px] w-[18px]" />,
      lines: phones.map((entry, index) => ({
        key: `phone_${index}`,
        text: entry.value,
        href: `tel:${entry.value.replace(/\s+/g, "")}`,
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  const addresses = draft.address_entries.filter(
    (entry) => format_address_lines(entry).length > 0,
  );

  if (addresses.length > 0) {
    rows.push({
      key: "address",
      icon: <MapPinIcon className="h-[18px] w-[18px]" />,
      lines: addresses.map((entry, index) => ({
        key: `address_${index}`,
        text: format_address_lines(entry).join(", "),
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  if (draft.birthday.trim()) {
    rows.push({
      key: "birthday",
      icon: <CakeIcon className="h-[18px] w-[18px]" />,
      lines: [
        {
          key: "birthday",
          text: format_date_label(draft.birthday),
          label: t("common.birthday"),
        },
      ],
    });
  }

  const dates = draft.date_entries.filter((entry) => entry.value.trim());

  if (dates.length > 0) {
    rows.push({
      key: "dates",
      icon: <CalendarDaysIcon className="h-[18px] w-[18px]" />,
      lines: dates.map((entry, index) => ({
        key: `date_${index}`,
        text: format_date_label(entry.value),
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  const websites = draft.websites.filter((entry) => entry.value.trim());

  if (websites.length > 0) {
    rows.push({
      key: "websites",
      icon: <LinkIcon className="h-[18px] w-[18px]" />,
      lines: websites.map((entry, index) => ({
        key: `website_${index}`,
        text: entry.value,
        href: normalize_url(entry.value),
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  const socials = draft.social_networks.filter((entry) => entry.value.trim());

  if (socials.length > 0) {
    rows.push({
      key: "socials",
      icon: <AtSymbolIcon className="h-[18px] w-[18px]" />,
      lines: socials.map((entry, index) => ({
        key: `social_${index}`,
        text: entry.value,
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  const messengers = draft.instant_messengers.filter((entry) =>
    entry.value.trim(),
  );

  if (messengers.length > 0) {
    rows.push({
      key: "messengers",
      icon: <ChatBubbleLeftRightIcon className="h-[18px] w-[18px]" />,
      lines: messengers.map((entry, index) => ({
        key: `messenger_${index}`,
        text: entry.value,
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  const related = draft.related_people.filter((entry) => entry.value.trim());

  if (related.length > 0) {
    rows.push({
      key: "related",
      icon: <UsersIcon className="h-[18px] w-[18px]" />,
      lines: related.map((entry, index) => ({
        key: `related_${index}`,
        text: entry.value,
        label: t(type_label_key(entry.type)),
      })),
    });
  }

  if (draft.notes.trim()) {
    rows.push({
      key: "notes",
      icon: <DocumentTextIcon className="h-[18px] w-[18px]" />,
      lines: [{ key: "notes", text: draft.notes }],
    });
  }

  return (
    <div className="w-full">
      <div className="mb-7 flex items-start gap-5">
        <ContactAvatar
          avatar_url={draft.avatar_url}
          email={draft.email_entries[0]?.value}
          name={`${draft.first_name || ""} ${draft.last_name || ""}`.trim()}
          profile_color={draft.profile_color}
          size_px={104}
        />
        <div className="min-w-0 flex-1 pt-2">
          <h2 className="truncate text-[26px] font-normal leading-tight text-txt-primary">
            {display_name}
          </h2>
          {draft.nickname.trim() && (
            <p className="mt-1 truncate text-[13px] text-txt-secondary">
              {draft.nickname}
            </p>
          )}
          {subtitle_parts.length > 0 && (
            <p className="mt-1 truncate text-[13.5px] text-txt-secondary">
              {subtitle_parts.join(" • ")}
            </p>
          )}
          {draft.pronouns.trim() && (
            <p className="mt-1 truncate text-[12.5px] text-txt-muted">
              {draft.pronouns}
            </p>
          )}
        </div>
      </div>

      {group_chips.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {group_chips.map((group) => (
            <span key={group.id} className="contact_view_chip">
              <BriefcaseIcon className="h-3.5 w-3.5" />
              {group.name}
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="contact_view_card">
          <p className="text-[13px] text-txt-muted">
            {t("common.no_contact_details")}
          </p>
        </div>
      ) : (
        <div className="contact_view_card">
          <h3 className="mb-4 text-[15px] font-medium text-txt-primary">
            {t("common.contact_details")}
          </h3>
          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <div key={row.key} className="flex items-start gap-4">
                <span className="mt-[3px] flex-shrink-0 text-txt-muted">
                  {row.icon}
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  {row.lines.map((line) => (
                    <div
                      key={line.key}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                    >
                      {line.href ? (
                        <a
                          className="contact_view_link min-w-0 break-words"
                          href={line.href}
                          rel={
                            /^https?:/i.test(line.href)
                              ? "noopener noreferrer"
                              : undefined
                          }
                          target={
                            /^https?:/i.test(line.href) ? "_blank" : undefined
                          }
                        >
                          {line.text}
                        </a>
                      ) : (
                        <button
                          className="min-w-0 whitespace-pre-wrap break-words text-start text-[13.5px] text-txt-primary"
                          type="button"
                          onClick={() => void on_copy(line.text, line.key)}
                        >
                          {line.text}
                        </button>
                      )}
                      {line.label && (
                        <span className="flex-shrink-0 text-[12.5px] text-txt-muted">
                          {"•"} {line.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
