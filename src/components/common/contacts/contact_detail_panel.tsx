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
import type { TranslationKey } from "@/lib/i18n";

import {
  EnvelopeIcon,
  PhoneIcon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  PaperAirplaneIcon,
  MapPinIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Button } from "@aster/ui";

import { ContactHistoryPanel } from "@/components/contacts/contact_history_panel";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { RELATIONSHIP_LABELS } from "@/types/contacts";

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
}

export function ContactDetailPanel({
  t,
  selected_contact,
  show_history,
  set_show_history,
  copied_field,
  on_edit,
  on_delete_request,
  on_compose_email,
  on_copy,
}: ContactDetailPanelProps) {
  const full_name = selected_contact
    ? `${selected_contact.first_name} ${selected_contact.last_name}`.trim()
    : "";

  return (
    <div className="hidden md:flex md:w-1/2 flex-col min-w-0">
      {selected_contact ? (
        <div key={selected_contact.id} className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-edge-primary">
            <h2 className="text-[14px] font-medium text-txt-primary">
              {t("common.contact_details")}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                className="h-8 px-3 text-[12px] gap-1.5"
                size="md"
                variant={show_history ? "primary" : "outline"}
                onClick={() => set_show_history(!show_history)}
              >
                <DocumentTextIcon className="w-3.5 h-3.5" />
                {t("common.history")}
              </Button>
              <Button
                className="h-8 px-3 text-[12px] gap-1.5"
                size="md"
                variant="outline"
                onClick={() => on_edit(selected_contact)}
              >
                <PencilIcon className="w-3.5 h-3.5" />
                {t("common.edit")}
              </Button>
              <Button
                className="h-8 px-3 text-[12px] gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                size="md"
                variant="outline"
                onClick={() => on_delete_request(selected_contact)}
              >
                <TrashIcon className="w-3.5 h-3.5" />
                {t("common.delete")}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {show_history ? (
              <div key="history" className="max-w-lg mx-auto">
                <ContactHistoryPanel contact_id={selected_contact.id} />
              </div>
            ) : (
              <div key="details">
                <div className="flex items-center gap-4 mb-6">
                  <ProfileAvatar
                    email={selected_contact.emails[0]}
                    image_url={selected_contact.avatar_url}
                    name={full_name}
                    size="xl"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold truncate text-txt-primary">
                        {full_name || t("common.unnamed_contact")}
                      </h3>
                      {selected_contact.is_favorite && (
                        <StarIconSolid className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      )}
                    </div>
                    {(selected_contact.job_title ||
                      selected_contact.company) && (
                      <p className="text-[13px] truncate text-txt-secondary">
                        {selected_contact.job_title && selected_contact.company
                          ? `${selected_contact.job_title} at ${selected_contact.company}`
                          : selected_contact.job_title ||
                            selected_contact.company}
                      </p>
                    )}
                  </div>
                  {selected_contact.emails[0] && (
                    <Button
                      className="h-9 px-4 text-[13px] gap-2 flex-shrink-0"
                      onClick={() =>
                        on_compose_email(selected_contact.emails[0])
                      }
                    >
                      <PaperAirplaneIcon className="w-3.5 h-3.5" />
                      {t("common.email")}
                    </Button>
                  )}
                </div>

                <div className="rounded-xl border divide-y border-edge-secondary bg-surf-secondary">
                  {selected_contact.emails.map((email, index) => (
                    <div
                      key={`email-${index}`}
                      className="flex items-center gap-3 px-4 py-3 group cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      role="button"
                      tabIndex={0}
                      onClick={() => on_compose_email(email)}
                      onKeyDown={(e) => {
                        if (e["key"] === "Enter" || e["key"] === " ") {
                          e.preventDefault();
                          on_compose_email(email);
                        }
                      }}
                    >
                      <EnvelopeIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                      <span className="text-[13px] flex-1 truncate text-txt-primary">
                        {email}
                      </span>
                      <button
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={(e) => {
                          e.stopPropagation();
                          on_copy(email, `email-${index}`);
                        }}
                      >
                        {copied_field === `email-${index}` ? (
                          <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                        )}
                      </button>
                    </div>
                  ))}

                  {selected_contact.phone && (
                    <div className="flex items-center gap-3 px-4 py-3 group">
                      <PhoneIcon className="w-4 h-4 flex-shrink-0 text-txt-muted" />
                      <span className="text-[13px] flex-1 text-txt-primary">
                        {selected_contact.phone}
                      </span>
                      <button
                        className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() =>
                          on_copy(selected_contact.phone!, "phone")
                        }
                      >
                        {copied_field === "phone" ? (
                          <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <ClipboardDocumentIcon className="w-3.5 h-3.5 text-txt-muted" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {(selected_contact.company ||
                  selected_contact.job_title ||
                  selected_contact.relationship ||
                  selected_contact.birthday) && (
                  <div className="mt-4 rounded-xl border border-edge-secondary bg-surf-secondary overflow-hidden divide-y divide-edge-secondary">
                    {selected_contact.company && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wider mb-0.5 text-txt-muted">
                          {t("common.company")}
                        </p>
                        <p className="text-[13px] truncate text-txt-primary">
                          {selected_contact.company}
                        </p>
                      </div>
                    )}
                    {selected_contact.job_title && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wider mb-0.5 text-txt-muted">
                          {t("common.job_title")}
                        </p>
                        <p className="text-[13px] truncate text-txt-primary">
                          {selected_contact.job_title}
                        </p>
                      </div>
                    )}
                    {selected_contact.relationship && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wider mb-0.5 text-txt-muted">
                          {t("common.relationship")}
                        </p>
                        <p className="text-[13px] text-txt-primary">
                          {RELATIONSHIP_LABELS[selected_contact.relationship] ||
                            selected_contact.relationship}
                        </p>
                      </div>
                    )}
                    {selected_contact.birthday && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wider mb-0.5 text-txt-muted">
                          {t("common.birthday")}
                        </p>
                        <p className="text-[13px] text-txt-primary">
                          {new Date(
                            selected_contact.birthday,
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selected_contact.address &&
                  (selected_contact.address.street ||
                    selected_contact.address.city ||
                    selected_contact.address.country) && (
                    <div className="mt-4 rounded-xl border px-4 py-3 border-edge-secondary bg-surf-secondary">
                      <div className="flex items-start gap-3">
                        <MapPinIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-txt-muted" />
                        <p className="text-[13px] text-txt-primary">
                          {[
                            selected_contact.address.street,
                            [
                              selected_contact.address.city,
                              selected_contact.address.state,
                              selected_contact.address.postal_code,
                            ]
                              .filter(Boolean)
                              .join(", "),
                            selected_contact.address.country?.toUpperCase(),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  )}

                {selected_contact.social_links &&
                  (selected_contact.social_links.website ||
                    selected_contact.social_links.linkedin ||
                    selected_contact.social_links.twitter ||
                    selected_contact.social_links.github) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selected_contact.social_links.website && (
                        <a
                          className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] border-edge-secondary text-txt-secondary"
                          href={
                            selected_contact.social_links.website.startsWith(
                              "http",
                            )
                              ? selected_contact.social_links.website
                              : `https://${selected_contact.social_links.website}`
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <GlobeAltIcon className="w-3.5 h-3.5" />
                          {t("common.website")}
                        </a>
                      )}
                      {selected_contact.social_links.linkedin && (
                        <a
                          className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] border-edge-secondary text-txt-secondary"
                          href={
                            selected_contact.social_links.linkedin.includes(
                              "linkedin.com",
                            )
                              ? selected_contact.social_links.linkedin
                              : `https://linkedin.com/in/${selected_contact.social_links.linkedin}`
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          LinkedIn
                        </a>
                      )}
                      {selected_contact.social_links.twitter && (
                        <a
                          className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] border-edge-secondary text-txt-secondary"
                          href={
                            selected_contact.social_links.twitter.includes(
                              "twitter.com",
                            ) ||
                            selected_contact.social_links.twitter.includes(
                              "x.com",
                            )
                              ? selected_contact.social_links.twitter
                              : `https://x.com/${selected_contact.social_links.twitter.replace("@", "")}`
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          X
                        </a>
                      )}
                      {selected_contact.social_links.github && (
                        <a
                          className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] border-edge-secondary text-txt-secondary"
                          href={
                            selected_contact.social_links.github.includes(
                              "github.com",
                            )
                              ? selected_contact.social_links.github
                              : `https://github.com/${selected_contact.social_links.github}`
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          GitHub
                        </a>
                      )}
                    </div>
                  )}

                {selected_contact.notes && (
                  <div className="mt-4 rounded-xl border px-4 py-3 border-edge-secondary bg-surf-secondary">
                    <p className="text-[11px] uppercase tracking-wider mb-1 text-txt-muted">
                      {t("common.notes")}
                    </p>
                    <p className="text-[13px] whitespace-pre-wrap text-txt-primary">
                      {selected_contact.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          key="empty"
          className="flex-1 flex flex-col items-center justify-center px-8"
        >
          <UserPlusIcon className="w-10 h-10 mb-4 text-txt-muted" />
          <p className="text-[15px] font-medium mb-1 text-txt-primary">
            {t("common.no_contact_selected")}
          </p>
          <p className="text-[13px] text-center max-w-[240px] text-txt-muted">
            {t("common.select_contact_hint")}
          </p>
        </div>
      )}
    </div>
  );
}
