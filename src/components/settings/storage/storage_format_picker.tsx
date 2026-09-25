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
import { useState } from "react";
import { CircleStackIcon } from "@heroicons/react/24/outline";
import { Button, Island, IslandSection } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { InfoPopover } from "@/components/ui/info_popover";
import { SelectedBadge } from "@/components/settings/appearance/selected_badge";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";

interface StorageFormatPickerProps {
  storage_format: "aster" | "ipfs";
  on_change: (format: "aster" | "ipfs") => void;
}

export function StorageFormatPicker({
  storage_format,
  on_change,
}: StorageFormatPickerProps) {
  const { t } = use_i18n();
  const [show_ipfs_confirm, set_show_ipfs_confirm] = useState(false);

  const handle_select = (format: "aster" | "ipfs") => {
    if (format === storage_format) return;

    if (format === "ipfs") {
      set_show_ipfs_confirm(true);

      return;
    }

    on_change(format);
  };

  const handle_confirm_ipfs = () => {
    on_change("ipfs");
    set_show_ipfs_confirm(false);
  };

  const options: {
    format: "aster" | "ipfs";
    image: string;
    label: string;
  }[] = [
    {
      format: "aster",
      image: "/settings/aster_server.webp",
      label: t("settings.storage_format_aster_server"),
    },
    {
      format: "ipfs",
      image: "/settings/decentralized.webp",
      label: t("settings.storage_format_decentralized_ipfs"),
    },
  ];

  return (
    <IslandSection
      bare
      description={t("settings.storage_format_description")}
      footer={t("settings.storage_format_ipfs_hint")}
      icon={<CircleStackIcon />}
      title={t("settings.storage_format_title")}
      title_info={
        <InfoPopover
          description={t("settings.info_storage_format_description")}
          title={t("settings.info_storage_format_title")}
        />
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <Island
            key={option.format}
            interactive
            className="overflow-hidden"
            selected={storage_format === option.format}
          >
            <button
              className="block w-full text-start"
              type="button"
              onClick={() => handle_select(option.format)}
            >
              <div className="relative aspect-[5/3] overflow-hidden">
                <img
                  alt=""
                  className="w-full h-full object-cover block"
                  draggable={false}
                  loading="lazy"
                  src={option.image}
                />
                {storage_format === option.format && <SelectedBadge />}
              </div>
              <div className="px-3.5 py-3 flex items-center justify-center">
                <span className="text-sm font-medium text-txt-primary">
                  {option.label}
                </span>
              </div>
            </button>
          </Island>
        ))}
      </div>

      <Modal
        is_open={show_ipfs_confirm}
        on_close={() => set_show_ipfs_confirm(false)}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>
            {t("settings.storage_format_ipfs_confirm_title")}
          </ModalTitle>
          <ModalDescription>
            {t("settings.storage_format_ipfs_confirm_description")}
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <button
            className="px-4 py-2 text-sm font-medium rounded-[14px] transition-colors hover_bg text-txt-muted"
            onClick={() => set_show_ipfs_confirm(false)}
          >
            {t("common.cancel")}
          </button>
          <Button variant="depth" onClick={handle_confirm_ipfs}>
            {t("common.confirm")}
          </Button>
        </ModalFooter>
      </Modal>
    </IslandSection>
  );
}
