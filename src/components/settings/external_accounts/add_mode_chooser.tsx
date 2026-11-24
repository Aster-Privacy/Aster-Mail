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
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import {
  ArrowPathRoundedSquareIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Island, IslandRow } from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";

export type AddModeChoice = "server_sync" | "send_only";

interface AddModeChooserProps {
  is_open: boolean;
  on_close: () => void;
  on_choose: (mode: AddModeChoice) => void;
  sync_full: boolean;
  send_only_full: boolean;
  t: TranslationFn;
}

export function AddModeChooser({
  is_open,
  on_close,
  on_choose,
  sync_full,
  send_only_full,
  t,
}: AddModeChooserProps) {
  const options = [
    {
      mode: "server_sync" as const,
      icon: ArrowPathRoundedSquareIcon,
      title: t("settings.ext_v2_mode_sync_title"),
      description: t("settings.ext_v2_mode_sync_description"),
      full: sync_full,
    },
    {
      mode: "send_only" as const,
      icon: PaperAirplaneIcon,
      title: t("settings.ext_v2_mode_send_only_title"),
      description: t("settings.ext_v2_mode_send_only_description"),
      full: send_only_full,
    },
  ];

  return (
    <Modal is_open={is_open} on_close={on_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("settings.ext_v2_mode_chooser_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.ext_v2_mode_chooser_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        <Island divided className="overflow-hidden">
          {options.map((option) => (
            <IslandRow
              key={option.mode}
              chevron
              data-testid={`ext-mode-${option.mode}`}
              description={option.description}
              icon={<option.icon aria-hidden="true" />}
              label={option.title}
              layout="stacked"
              trailing={
                option.full ? (
                  <span className="account_menu_badge account_menu_badge_muted">
                    {t("settings.ext_v2_upgrade_badge")}
                  </span>
                ) : undefined
              }
              on_press={() => on_choose(option.mode)}
            />
          ))}
        </Island>
      </ModalBody>
    </Modal>
  );
}
