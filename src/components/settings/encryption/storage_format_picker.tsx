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
import type { UserPreferences } from "@/services/api/preferences";

import { useState } from "react";
import { CircleStackIcon } from "@heroicons/react/24/outline";
import { Button, Radio } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";

interface StorageFormatPickerProps {
  storage_format: "aster" | "ipfs";
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
}

export function StorageFormatPicker({
  storage_format,
  update_preference,
}: StorageFormatPickerProps) {
  const { t } = use_i18n();
  const [show_ipfs_confirm, set_show_ipfs_confirm] = useState(false);

  const handle_select = (format: "aster" | "ipfs") => {
    if (format === storage_format) return;

    if (format === "ipfs") {
      set_show_ipfs_confirm(true);

      return;
    }

    update_preference("storage_format", format, true);
  };

  const handle_confirm_ipfs = () => {
    update_preference("storage_format", "ipfs", true);
    set_show_ipfs_confirm(false);
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <CircleStackIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.storage_format_title")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <p className="text-sm mb-4 text-txt-muted">
        {t("settings.storage_format_description")}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          className="rounded-xl border-2 overflow-hidden text-left transition-all"
          style={{
            borderColor:
              storage_format === "aster"
                ? "var(--accent-color)"
                : "var(--border-secondary)",
            backgroundColor: "var(--bg-tertiary)",
          }}
          type="button"
          onClick={() => handle_select("aster")}
        >
          <div className="aspect-[5/3] overflow-hidden">
            <img
              alt=""
              className="w-full h-full object-cover block"
              draggable={false}
              loading="lazy"
              src="/settings/aster_server.webp"
            />
          </div>
          <div className="px-3.5 py-3 flex items-center justify-between border-t border-edge-primary">
            <span className="text-sm font-medium text-txt-primary">
              {t("settings.storage_format_aster_server")}
            </span>
            <span className="pointer-events-none flex-shrink-0">
              <Radio readOnly checked={storage_format === "aster"} />
            </span>
          </div>
        </button>

        <button
          className="rounded-xl border-2 overflow-hidden text-left transition-all"
          style={{
            borderColor:
              storage_format === "ipfs"
                ? "var(--accent-color)"
                : "var(--border-secondary)",
            backgroundColor: "var(--bg-tertiary)",
          }}
          type="button"
          onClick={() => handle_select("ipfs")}
        >
          <div className="aspect-[5/3] overflow-hidden">
            <img
              alt=""
              className="w-full h-full object-cover block"
              draggable={false}
              loading="lazy"
              src="/settings/decentralized.webp"
            />
          </div>
          <div className="px-3.5 py-3 flex items-center justify-between border-t border-edge-primary">
            <span className="text-sm font-medium text-txt-primary">
              {t("settings.storage_format_decentralized_ipfs")}
            </span>
            <span className="pointer-events-none flex-shrink-0">
              <Radio readOnly checked={storage_format === "ipfs"} />
            </span>
          </div>
        </button>
      </div>

      <p className="text-xs mt-3 text-txt-muted leading-relaxed">
        {t("settings.storage_format_ipfs_hint")}
      </p>

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
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors hover_bg text-txt-muted"
            onClick={() => set_show_ipfs_confirm(false)}
          >
            {t("common.cancel")}
          </button>
          <Button variant="depth" onClick={handle_confirm_ipfs}>
            {t("common.confirm")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
