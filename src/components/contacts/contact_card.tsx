import type { DecryptedContact } from "@/types/contacts";

import { motion } from "framer-motion";
import {
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ContactCardProps {
  contact: DecryptedContact;
  on_edit: (contact: DecryptedContact) => void;
  on_delete: (contact: DecryptedContact) => void;
  on_click: (contact: DecryptedContact) => void;
  is_selected?: boolean;
  is_selection_mode?: boolean;
  on_select?: (contact: DecryptedContact) => void;
}

export function ContactCard({
  contact,
  on_edit,
  on_delete,
  on_click,
  is_selected = false,
  is_selection_mode = false,
  on_select,
}: ContactCardProps) {
  const full_name = `${contact.first_name} ${contact.last_name}`.trim();
  const primary_email = contact.emails[0] || "";

  const handle_click = () => {
    if (is_selection_mode && on_select) {
      on_select(contact);
    } else {
      on_click(contact);
    }
  };

  const handle_checkbox_click = (e: React.MouseEvent) => {
    e.stopPropagation();
    on_select?.(contact);
  };

  return (
    <div
      className="group relative flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 hover:shadow-sm"
      role="button"
      style={{
        backgroundColor: is_selected ? "var(--bg-secondary)" : "var(--bg-card)",
        borderColor: is_selected
          ? "var(--accent-blue)"
          : "var(--border-primary)",
      }}
      tabIndex={0}
      onClick={handle_click}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handle_click();
        }
      }}
    >
      <div className="relative">
        {is_selection_mode && (
          <motion.button
            animate={{ scale: 1, opacity: 1 }}
            className="absolute -left-1 -top-1 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-colors"
            initial={{ scale: 0.8, opacity: 0 }}
            style={{
              backgroundColor: is_selected
                ? "var(--accent-blue)"
                : "var(--bg-primary)",
              borderWidth: is_selected ? 0 : 2,
              borderColor: "var(--border-secondary)",
            }}
            onClick={handle_checkbox_click}
          >
            {is_selected && (
              <CheckIcon className="w-3 h-3 text-white" strokeWidth={3} />
            )}
          </motion.button>
        )}
        <ProfileAvatar
          email={primary_email}
          image_url={contact.avatar_url}
          name={full_name || "Contact"}
          size="lg"
        />
      </div>

      <div className="flex-1 min-w-0">
        <h3
          className="text-[15px] font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {full_name || "Unnamed Contact"}
        </h3>

        {primary_email && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <EnvelopeIcon
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <span
              className="text-[13px] truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {primary_email}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 mt-1">
          {contact.phone && (
            <div className="flex items-center gap-1">
              <PhoneIcon
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {contact.phone}
              </span>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-1">
              <BuildingOfficeIcon
                className="w-3 h-3 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {contact.company}
              </span>
            </div>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            size="icon"
            variant="ghost"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <EllipsisVerticalIcon
              className="h-4 w-4"
              style={{ color: "var(--text-muted)" }}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              on_edit(contact);
            }}
          >
            <PencilIcon className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-500 focus:text-red-500"
            onClick={(e) => {
              e.stopPropagation();
              on_delete(contact);
            }}
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
