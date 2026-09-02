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

import { useMemo, useState } from "react";
import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { use_contact_groups } from "@/hooks/use_contact_groups";
import { use_i18n } from "@/lib/i18n/context";

type MembershipState = "none" | "some" | "all";

interface ManageGroupsMenuProps {
  selected_contacts: DecryptedContact[];
  on_set_membership: (group_id: string, should_add: boolean) => void;
}

export function ManageGroupsMenu({
  selected_contacts,
  on_set_membership,
}: ManageGroupsMenuProps) {
  const { t } = use_i18n();
  const { groups, is_loading } = use_contact_groups();
  const [is_create_open, set_is_create_open] = useState(false);

  const membership = useMemo(() => {
    const map = new Map<string, MembershipState>();

    for (const group of groups) {
      const count = selected_contacts.filter((contact) =>
        (contact.groups || []).includes(group.id),
      ).length;

      map.set(
        group.id,
        count === 0
          ? "none"
          : count === selected_contacts.length
            ? "all"
            : "some",
      );
    }

    return map;
  }, [groups, selected_contacts]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("common.manage_contact_groups")}
            className="h-8 w-8 inline-flex items-center justify-center rounded-[8px] text-txt-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            type="button"
          >
            <UserGroupIcon className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>
            {t("common.manage_contact_groups")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {groups.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-txt-muted">
              {is_loading
                ? t("common.loading")
                : t("common.no_contact_groups_yet")}
            </p>
          ) : (
            groups.map((group) => {
              const state = membership.get(group.id) ?? "none";

              return (
                <DropdownMenuItem
                  key={group.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    on_set_membership(group.id, state !== "all");
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="w-4 h-4 rounded-[4px] border border-edge-primary flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor:
                        state === "none" ? "transparent" : group.color,
                      borderColor: state === "none" ? undefined : group.color,
                    }}
                  >
                    {state === "all" && (
                      <CheckIcon className="w-3 h-3 text-white" />
                    )}
                    {state === "some" && (
                      <MinusIcon className="w-3 h-3 text-white" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{group.name}</span>
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => set_is_create_open(true)}>
            <PlusIcon className="w-4 h-4" />
            {t("common.create_contact_group")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactGroupModal
        is_open={is_create_open}
        on_close={() => set_is_create_open(false)}
        on_saved={(group_id) => on_set_membership(group_id, true)}
      />
    </>
  );
}
