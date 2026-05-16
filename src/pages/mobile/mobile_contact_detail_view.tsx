//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedContact } from "@/types/contacts";

import { motion } from "framer-motion";
import {
  StarIcon as StarOutline,
  EnvelopeIcon,
  ClipboardIcon,
  ChevronLeftIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  CakeIcon,
  GlobeAltIcon,
  MapPinIcon,
  ChatBubbleLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
import { ProfileAvatar } from "@/components/ui/profile_avatar";

function DetailCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl bg-[var(--mobile-bg-card)]">
      {children}
    </div>
  );
}

function DetailCardHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 pt-3">
      <span className="text-[var(--text-muted)]">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}

function DetailRow({
  label,
  sublabel,
  is_last,
  on_action,
  on_copy,
  action_icon,
}: {
  label: string;
  sublabel?: string;
  is_last?: boolean;
  on_action?: () => void;
  on_copy?: () => void;
  action_icon?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2.5 ${!is_last ? "border-b border-[var(--border-primary)]" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] text-[var(--text-primary)]">
          {label}
        </p>
        {sublabel && (
          <p className="text-[11px] text-[var(--text-muted)]">{sublabel}</p>
        )}
      </div>
      {on_copy && (
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={on_copy}
        >
          <ClipboardIcon className="h-4 w-4" />
        </button>
      )}
      {on_action && action_icon && (
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--accent-color,#3b82f6)] active:bg-[var(--bg-tertiary)]"
          type="button"
          onClick={on_action}
        >
          {action_icon}
        </button>
      )}
    </div>
  );
}

export function ContactDetailView({
  contact,
  on_back,
  on_compose,
  on_copy,
  on_edit,
  on_delete,
  on_toggle_favorite,
  reduce_motion,
}: {
  contact: DecryptedContact;
  on_back: () => void;
  on_compose: (email: string) => void;
  on_copy: (text: string) => void;
  on_edit: (contact: DecryptedContact) => void;
  on_delete: (contact: DecryptedContact) => void;
  on_toggle_favorite: (contact: DecryptedContact) => void;
  reduce_motion: boolean;
}) {
  const { t } = use_i18n();
  const display_name =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.emails[0] ||
    "";
  const primary_email = contact.emails[0] ?? "";
  const has_address =
    contact.address &&
    Object.values(contact.address).some((v) => v && v.trim());
  const has_social =
    contact.social_links &&
    Object.values(contact.social_links).some((v) => v && v.trim());
  const address_string = contact.address
    ? [
        contact.address.street,
        contact.address.city,
        contact.address.state,
        contact.address.postal_code,
        contact.address.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)]"
      exit={reduce_motion ? { opacity: 0 } : { opacity: 0, x: "100%" }}
      initial={reduce_motion ? false : { opacity: 0, x: "100%" }}
      transition={
        reduce_motion
          ? { duration: 0 }
          : { type: "tween", duration: 0.25, ease: "easeOut" }
      }
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-primary)] px-2 py-2 safe-area-pt">
        <motion.button
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
          type="button"
          onClick={on_back}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </motion.button>
        <span className="flex-1" />
        <motion.button
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
          type="button"
          onClick={() => on_toggle_favorite(contact)}
        >
          {contact.is_favorite ? (
            <StarSolid className="h-4 w-4 text-amber-400" />
          ) : (
            <StarOutline className="h-4 w-4" />
          )}
        </motion.button>
        <motion.button
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
          type="button"
          onClick={() => on_edit(contact)}
        >
          <PencilSquareIcon className="h-4 w-4" />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-3 px-6 py-8">
          <div className="h-24 w-24 overflow-hidden rounded-full shadow-lg">
            <ProfileAvatar
              use_domain_logo
              email={primary_email}
              name={display_name}
              size="xl"
            />
          </div>
          <div className="text-center">
            <p className="text-[20px] font-bold text-[var(--text-primary)]">
              {display_name}
            </p>
            {contact.company && (
              <p className="mt-0.5 text-[14px] text-[var(--text-muted)]">
                {contact.job_title
                  ? `${contact.job_title} · ${contact.company}`
                  : contact.company}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-6 px-8 pb-6">
          {primary_email && (
            <motion.button
              className="flex flex-col items-center gap-1.5"
              type="button"
              onClick={() => on_compose(primary_email)}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)]">
                <EnvelopeIcon className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {t("common.mail")}
              </span>
            </motion.button>
          )}
          {contact.phone && (
            <motion.button
              className="flex flex-col items-center gap-1.5"
              type="button"
              onClick={() => {
                window.open(`tel:${contact.phone}`, "_self");
              }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                style={{
                  background:
                    "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
                }}
              >
                <PhoneIcon className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {t("common.call")}
              </span>
            </motion.button>
          )}
          <motion.button
            className="flex flex-col items-center gap-1.5"
            type="button"
            onClick={() => on_copy(primary_email || display_name)}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)]">
              <ClipboardIcon className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {t("common.copy")}
            </span>
          </motion.button>
        </div>

        <div className="space-y-3 px-4 pb-8">
          {contact.emails.length > 0 && (
            <DetailCard>
              <DetailCardHeader
                icon={<EnvelopeIcon className="h-4 w-4" />}
                label={t("common.email_section")}
              />
              {contact.emails.map((email, i) => (
                <DetailRow
                  key={email}
                  is_last={i === contact.emails.length - 1}
                  label={email}
                  on_copy={() => on_copy(email)}
                />
              ))}
            </DetailCard>
          )}

          {contact.phone && (
            <DetailCard>
              <DetailCardHeader
                icon={<PhoneIcon className="h-4 w-4" />}
                label={t("common.phone_section")}
              />
              <DetailRow
                is_last
                label={contact.phone}
                on_copy={() => on_copy(contact.phone!)}
              />
            </DetailCard>
          )}

          {(contact.company || contact.job_title) && (
            <DetailCard>
              <DetailCardHeader
                icon={<BuildingOfficeIcon className="h-4 w-4" />}
                label={t("common.work_section")}
              />
              {contact.company && (
                <DetailRow
                  is_last={!contact.job_title}
                  label={contact.company}
                  on_copy={() => on_copy(contact.company!)}
                  sublabel={t("common.company")}
                />
              )}
              {contact.job_title && (
                <DetailRow
                  is_last
                  label={contact.job_title}
                  on_copy={() => on_copy(contact.job_title!)}
                  sublabel={t("common.job_title")}
                />
              )}
            </DetailCard>
          )}

          {contact.birthday && (
            <DetailCard>
              <DetailCardHeader
                icon={<CakeIcon className="h-4 w-4" />}
                label={t("common.birthday_section")}
              />
              <DetailRow
                is_last
                label={contact.birthday}
                on_copy={() => on_copy(contact.birthday!)}
              />
            </DetailCard>
          )}

          {has_address && (
            <DetailCard>
              <DetailCardHeader
                icon={<MapPinIcon className="h-4 w-4" />}
                label={t("common.address_section")}
              />
              <DetailRow
                is_last
                label={address_string}
                on_copy={() => on_copy(address_string)}
              />
            </DetailCard>
          )}

          {has_social && (
            <DetailCard>
              <DetailCardHeader
                icon={<GlobeAltIcon className="h-4 w-4" />}
                label={t("common.social_section")}
              />
              {contact.social_links?.website && (
                <DetailRow
                  action_icon={<LinkIcon className="h-4 w-4" />}
                  is_last={
                    !contact.social_links.linkedin &&
                    !contact.social_links.twitter &&
                    !contact.social_links.github
                  }
                  label={contact.social_links.website}
                  on_action={() =>
                    window.open(
                      contact.social_links!.website!,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  on_copy={() => on_copy(contact.social_links!.website!)}
                  sublabel={t("common.website")}
                />
              )}
              {contact.social_links?.linkedin && (
                <DetailRow
                  is_last={
                    !contact.social_links.twitter &&
                    !contact.social_links.github
                  }
                  label={contact.social_links.linkedin}
                  on_copy={() => on_copy(contact.social_links!.linkedin!)}
                  sublabel={t("common.linkedin")}
                />
              )}
              {contact.social_links?.twitter && (
                <DetailRow
                  is_last={!contact.social_links.github}
                  label={contact.social_links.twitter}
                  on_copy={() => on_copy(contact.social_links!.twitter!)}
                  sublabel={t("common.twitter_x")}
                />
              )}
              {contact.social_links?.github && (
                <DetailRow
                  is_last
                  label={contact.social_links.github}
                  on_copy={() => on_copy(contact.social_links!.github!)}
                  sublabel={t("common.github")}
                />
              )}
            </DetailCard>
          )}

          {contact.notes && (
            <DetailCard>
              <DetailCardHeader
                icon={<ChatBubbleLeftIcon className="h-4 w-4" />}
                label={t("common.notes_section")}
              />
              <div className="px-4 pb-3">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--text-secondary)]">
                  {contact.notes}
                </p>
              </div>
            </DetailCard>
          )}

          <button
            className="flex w-full items-center justify-center gap-2 rounded-[16px] py-3.5 text-[14px] font-medium text-white active:opacity-70"
            style={{
              background: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
              boxShadow:
                "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            type="button"
            onClick={() => on_delete(contact)}
          >
            <TrashIcon className="h-4 w-4" />
            {t("common.delete")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
