import type { DecryptedContact } from "@/types/contacts";

import { forwardRef } from "react";
import {
  ChevronRightIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
} from "@heroicons/react/24/outline";

import { Checkbox } from "@/components/ui/checkbox";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { cn } from "@/lib/utils";

interface ContactListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  contact: DecryptedContact;
  is_selected: boolean;
  on_toggle_select: (id: string) => void;
  on_click: (contact: DecryptedContact) => void;
}

export const ContactListItem = forwardRef<HTMLDivElement, ContactListItemProps>(
  function ContactListItem(
    { contact, is_selected, on_toggle_select, on_click, className, ...props },
    ref,
  ) {
    const full_name = `${contact.first_name} ${contact.last_name}`.trim();
    const primary_email = contact.emails[0] || "";

    return (
      <div
        ref={ref}
        className={cn(
          "group flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b cursor-pointer transition-colors",
          is_selected
            ? "bg-blue-50 dark:bg-blue-500/10"
            : "hover:bg-[var(--bg-hover)]",
          className,
        )}
        role="button"
        style={{ borderColor: "var(--border-secondary)" }}
        tabIndex={0}
        onClick={() => on_click(contact)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            on_click(contact);
          }
        }}
        {...props}
      >
        <div
          className="flex items-center gap-2 sm:gap-3 flex-shrink-0"
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
            }
          }}
        >
          <div
            className="sm:p-0 p-1.5 -m-1.5 sm:m-0"
            role="button"
            tabIndex={0}
            onClick={() => on_toggle_select(contact.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                on_toggle_select(contact.id);
              }
            }}
          >
            <Checkbox
              checked={is_selected}
              onCheckedChange={() => on_toggle_select(contact.id)}
            />
          </div>
        </div>

        <ProfileAvatar
          className="flex-shrink-0"
          email={primary_email}
          image_url={contact.avatar_url}
          name={full_name}
          size="sm"
        />

        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4">
          <div className="sm:w-48 sm:flex-shrink-0">
            <span
              className={cn(
                "truncate text-sm block",
                is_selected
                  ? "font-medium text-[var(--text-primary)]"
                  : "font-medium text-[var(--text-primary)]",
              )}
            >
              {full_name || "Unnamed Contact"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {primary_email && (
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <EnvelopeIcon
                  className="w-3.5 h-3.5 flex-shrink-0 hidden sm:block"
                  style={{ color: "var(--text-muted)" }}
                />
                <span
                  className="text-sm truncate"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {primary_email}
                </span>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-4 flex-shrink-0">
            {contact.phone && (
              <div className="flex items-center gap-1.5 w-32">
                <PhoneIcon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <span
                  className="text-sm truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {contact.phone}
                </span>
              </div>
            )}

            {contact.company && (
              <div className="flex items-center gap-1.5 w-36">
                <BuildingOfficeIcon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <span
                  className="text-sm truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {contact.company}
                </span>
              </div>
            )}
          </div>
        </div>

        <ChevronRightIcon
          className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  },
);
