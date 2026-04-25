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

import { motion } from "framer-motion";
import {
  XMarkIcon,
  ArrowLeftIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  StarIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  PaperAirplaneIcon,
  BriefcaseIcon,
  CalendarIcon,
  MapPinIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { RELATIONSHIP_LABELS } from "@/types/contacts";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { EmailProfileTrigger } from "@/components/email/email_profile_trigger";
import { use_should_reduce_motion } from "@/provider";

interface ModalContactDetailProps {
  selected_contact: DecryptedContact;
  full_name: string;
  copied_field: string | null;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_back: () => void;
  on_close: () => void;
  on_edit: (contact: DecryptedContact) => void;
  on_delete: (contact: DecryptedContact) => void;
  on_compose_email: (email: string) => void;
  on_copy: (text: string, field: string) => void;
}

export function ModalContactDetail({
  selected_contact,
  full_name,
  copied_field,
  t,
  on_back,
  on_close,
  on_edit,
  on_delete,
  on_compose_email,
  on_copy,
}: ModalContactDetailProps) {
  const reduce_motion = use_should_reduce_motion();

  return (
    <motion.div
      key="detail"
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col"
      exit={{ opacity: 0, x: -10 }}
      initial={reduce_motion ? false : { opacity: 0, x: 10 }}
      transition={{ duration: reduce_motion ? 0 : 0.15 }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-edge-secondary">
        <motion.button
          className="flex items-center gap-1 text-[14px] font-medium py-1.5 px-2 -ml-2 rounded-lg transition-colors text-txt-secondary"
          whileHover={{
            x: -2,
            backgroundColor: "rgba(0,0,0,0.03)",
          }}
          onClick={on_back}
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>{t("common.back")}</span>
        </motion.button>
        <motion.button
          className="p-2 rounded-lg text-txt-muted"
          whileHover={{ backgroundColor: "rgba(0,0,0,0.05)" }}
          onClick={on_close}
        >
          <XMarkIcon className="w-5 h-5" />
        </motion.button>
      </div>

      <div className="p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            initial={reduce_motion ? false : { scale: 0.9, opacity: 0 }}
            transition={{ delay: reduce_motion ? 0 : 0.05 }}
          >
            <ProfileAvatar
              className="mb-4 ring-4 ring-white dark:ring-zinc-900 shadow-lg"
              name={full_name}
              size="xl"
            />
          </motion.div>
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-semibold text-txt-primary">
              {full_name || t("common.unnamed_contact")}
            </h2>
            {selected_contact.is_favorite && (
              <StarIcon className="w-5 h-5 fill-amber-400 text-amber-400" />
            )}
          </div>
          {(selected_contact.job_title || selected_contact.company) && (
            <p className="text-[14px] mt-0.5 text-txt-secondary">
              {selected_contact.job_title && selected_contact.company
                ? t("common.job_title_at_company", {
                    job_title: selected_contact.job_title,
                    company: selected_contact.company,
                  })
                : selected_contact.job_title || selected_contact.company}
            </p>
          )}

          <div className="flex gap-2 mt-5">
            {selected_contact.emails[0] && (
              <Button
                size="xl"
                variant="depth"
                onClick={() => on_compose_email(selected_contact.emails[0])}
              >
                <PaperAirplaneIcon className="w-3.5 h-3.5" />
                {t("common.send_email")}
              </Button>
            )}
            <Button
              className="h-10 px-5 text-[14px] font-normal gap-1.5 bg-surf-secondary border-edge-primary text-txt-primary"
              variant="outline"
              onClick={() => on_edit(selected_contact)}
            >
              <PencilIcon className="w-3.5 h-3.5" />
              {t("common.edit")}
            </Button>
            <Button
              className="h-10 w-10 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 border-transparent hover:border-red-200 dark:hover:border-red-500/30"
              variant="outline"
              onClick={() => on_delete(selected_contact)}
            >
              <TrashIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {selected_contact.emails.map((email, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3.5 rounded-xl group bg-surf-secondary"
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <EnvelopeIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("auth.email")}
                </p>
                <EmailProfileTrigger
                  email={email}
                  name={full_name}
                  on_compose={on_compose_email}
                >
                  <p className="text-[14px] truncate -mt-0.5 text-txt-primary">
                    {email}
                  </p>
                </EmailProfileTrigger>
              </div>
              <motion.button
                className="p-2 rounded-lg opacity-0 group-hover:opacity-100"
                whileHover={{
                  backgroundColor: "rgba(0,0,0,0.05)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  on_copy(email, `email-${index}`);
                }}
              >
                {copied_field === `email-${index}` ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted" />
                )}
              </motion.button>
            </div>
          ))}

          {selected_contact.phone && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl group bg-surf-secondary">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <PhoneIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("common.phone")}
                </p>
                <p className="text-[14px] -mt-0.5 text-txt-primary">
                  {selected_contact.phone}
                </p>
              </div>
              <motion.button
                className="p-2 rounded-lg opacity-0 group-hover:opacity-100"
                whileHover={{
                  backgroundColor: "rgba(0,0,0,0.05)",
                }}
                onClick={() => on_copy(selected_contact.phone!, "phone")}
              >
                {copied_field === "phone" ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted" />
                )}
              </motion.button>
            </div>
          )}

          {selected_contact.company && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surf-secondary">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <BuildingOffice2Icon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("common.company")}
                </p>
                <p className="text-[14px] -mt-0.5 text-txt-primary">
                  {selected_contact.company}
                </p>
              </div>
            </div>
          )}

          {selected_contact.job_title && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surf-secondary">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <BriefcaseIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("common.job_title")}
                </p>
                <p className="text-[14px] -mt-0.5 text-txt-primary">
                  {selected_contact.job_title}
                </p>
              </div>
            </div>
          )}

          {selected_contact.relationship && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surf-secondary">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <UserPlusIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("common.relationship")}
                </p>
                <p className="text-[14px] -mt-0.5 text-txt-primary">
                  {RELATIONSHIP_LABELS[selected_contact.relationship] ||
                    selected_contact.relationship}
                </p>
              </div>
            </div>
          )}

          {selected_contact.birthday && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surf-secondary">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <CalendarIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("common.birthday")}
                </p>
                <p className="text-[14px] -mt-0.5 text-txt-primary">
                  {new Date(selected_contact.birthday).toLocaleDateString(
                    undefined,
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}
                </p>
              </div>
            </div>
          )}

          {selected_contact.address &&
            (selected_contact.address.street ||
              selected_contact.address.city ||
              selected_contact.address.country) && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surf-secondary">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                  <MapPinIcon className="w-4 h-4 text-txt-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                    {t("common.address")}
                  </p>
                  <p className="text-[14px] -mt-0.5 leading-relaxed text-txt-primary">
                    {[
                      selected_contact.address.street,
                      [
                        selected_contact.address.city,
                        selected_contact.address.state,
                        selected_contact.address.postal_code,
                      ]
                        .filter(Boolean)
                        .join(", "),
                      selected_contact.address.country,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </p>
                </div>
              </div>
            )}

          {selected_contact.social_links &&
            (selected_contact.social_links.website ||
              selected_contact.social_links.linkedin ||
              selected_contact.social_links.twitter ||
              selected_contact.social_links.github) && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-surf-secondary">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                  <GlobeAltIcon className="w-4 h-4 text-txt-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider mb-1 text-txt-muted">
                    {t("common.social_links")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selected_contact.social_links.website && (
                      <a
                        className="text-[13px] px-2.5 py-1 rounded-md transition-colors bg-surf-primary text-txt-secondary"
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
                        {t("common.website")}
                      </a>
                    )}
                    {selected_contact.social_links.linkedin && (
                      <a
                        className="text-[13px] px-2.5 py-1 rounded-md transition-colors bg-surf-primary text-txt-secondary"
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
                        {t("common.linkedin")}
                      </a>
                    )}
                    {selected_contact.social_links.twitter && (
                      <a
                        className="text-[13px] px-2.5 py-1 rounded-md transition-colors bg-surf-primary text-txt-secondary"
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
                        {t("common.twitter_x")}
                      </a>
                    )}
                    {selected_contact.social_links.github && (
                      <a
                        className="text-[13px] px-2.5 py-1 rounded-md transition-colors bg-surf-primary text-txt-secondary"
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
                        {t("common.github")}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

          {selected_contact.notes && (
            <div className="flex gap-3 p-3.5 rounded-xl bg-surf-secondary">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-surf-primary">
                <DocumentTextIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                  {t("common.notes")}
                </p>
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap -mt-0.5 text-txt-primary">
                  {selected_contact.notes}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
