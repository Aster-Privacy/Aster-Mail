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
import type { OAuthFolderList } from "@/services/api/external_accounts/api";
import type { PickerFolder } from "@/services/external_account_setup";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderIcon, InboxIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandRow,
  IslandSection,
  IslandSections,
  SettingToggleRow,
} from "@aster/ui";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ButtonSpinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { list_oauth_folders } from "@/services/api/external_accounts/api";
import {
  default_selected_folders,
  picker_folders,
} from "@/services/external_account_setup";

export interface OAuthFolderPickerResult {
  selected_folders: string[];
  import_existing: boolean;
  listed: OAuthFolderList;
}

interface OAuthFolderPickerModalProps {
  account_token: string | null;
  is_submitting?: boolean;
  for_import?: boolean;
  on_cancel: () => void;
  on_confirm: (result: OAuthFolderPickerResult) => void;
}

export function OAuthFolderPickerModal({
  account_token,
  is_submitting = false,
  for_import = false,
  on_cancel,
  on_confirm,
}: OAuthFolderPickerModalProps) {
  const { t } = use_i18n();
  const [listed, set_listed] = useState<OAuthFolderList | null>(null);
  const [folders, set_folders] = useState<PickerFolder[]>([]);
  const [selected, set_selected] = useState<Set<string>>(new Set());
  const [import_existing, set_import_existing] = useState(for_import);
  const [is_loading, set_is_loading] = useState(false);
  const [load_failed, set_load_failed] = useState(false);

  const load = useCallback(async (token: string, is_stale: () => boolean) => {
    set_is_loading(true);
    set_load_failed(false);
    const response = await list_oauth_folders(token);

    if (is_stale()) return;
    set_is_loading(false);
    if (response.error || !response.data) {
      set_load_failed(true);

      return;
    }
    const offered = picker_folders(response.data.folders ?? []);

    set_listed(response.data);
    set_folders(offered);
    const importable = new Set(
      (response.data.folders ?? [])
        .filter((folder) => !folder.excluded)
        .map((folder) => folder.name),
    );

    set_selected(
      new Set(
        for_import
          ? offered
              .filter((folder) => folder.is_inbox || importable.has(folder.name))
              .map((folder) => folder.name)
          : default_selected_folders(offered),
      ),
    );
  }, [for_import]);

  useEffect(() => {
    set_listed(null);
    set_folders([]);
    set_selected(new Set());
    set_import_existing(for_import);
    if (!account_token) return;
    let stale = false;

    load(account_token, () => stale);

    return () => {
      stale = true;
    };
  }, [account_token, for_import, load]);

  const toggle = (name: string, checked: boolean) => {
    set_selected((previous) => {
      const next = new Set(previous);

      if (checked) next.add(name);
      else next.delete(name);

      return next;
    });
  };

  const ordered_selection = useMemo(
    () => folders.filter((f) => selected.has(f.name)).map((f) => f.name),
    [folders, selected],
  );

  const all_selected =
    folders.length > 0 && ordered_selection.length === folders.length;

  const can_start =
    !!listed && ordered_selection.length > 0 && !is_loading && !is_submitting;

  return (
    <Modal
      is_open={account_token !== null}
      on_close={is_submitting ? () => {} : on_cancel}
      show_close_button={false}
      size="md"
    >
      <ModalHeader className="pe-6">
        <ModalTitle className="text-[15px]">
          {t("settings.oauth_folder_picker_title")}
        </ModalTitle>
        <ModalDescription>
          {t("settings.oauth_folder_picker_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="px-6 pb-2">
        {is_loading && (
          <div
            aria-busy="true"
            className="flex justify-center py-10 text-txt-muted"
            role="status"
          >
            <ButtonSpinner className="text-current" />
          </div>
        )}
        {load_failed && !is_loading && (
          <Island tone="danger">
            <IslandRow
              label={t("settings.oauth_folder_picker_load_failed")}
              trailing={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (account_token) load(account_token, () => false);
                  }}
                >
                  {t("common.retry")}
                </Button>
              }
            />
          </Island>
        )}
        {!is_loading && !load_failed && listed && (
          <IslandSections>
            <IslandSection
              description={
                ordered_selection.length === 0
                  ? t("settings.oauth_folder_picker_none_selected")
                  : t("settings.ext_v2_folders_selected", {
                      selected: ordered_selection.length,
                      total: folders.length,
                    })
              }
              icon={<FolderIcon />}
              title={t("common.folders")}
              trailing={
                folders.length > 1 ? (
                  <Button
                    disabled={is_submitting}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      set_selected(
                        all_selected
                          ? new Set()
                          : new Set(folders.map((f) => f.name)),
                      )
                    }
                  >
                    {all_selected
                      ? t("common.deselect_all")
                      : t("common.select_all")}
                  </Button>
                ) : undefined
              }
            >
              <div
                aria-label={t("common.folders")}
                className="aster_island_divided max-h-[312px] overflow-y-auto overscroll-contain"
                role="group"
              >
                {folders.map((folder, index) => (
                  <IslandRow
                    key={folder.name}
                    disabled={is_submitting}
                    icon={folder.is_inbox ? <InboxIcon /> : <FolderIcon />}
                    id={`oauth-folder-${index}`}
                    label={
                      <span className="block truncate" title={folder.label}>
                        {folder.label}
                      </span>
                    }
                    toggle={{
                      checked: selected.has(folder.name),
                      on_change: (checked) => toggle(folder.name, checked),
                    }}
                  />
                ))}
              </div>
            </IslandSection>
            <IslandSection bare>
              <Island>
                <SettingToggleRow
                  checked={import_existing}
                  description={
                    import_existing
                      ? t("settings.import_existing_mail_on")
                      : t("settings.import_existing_mail_off")
                  }
                  disabled={is_submitting}
                  label={t("settings.import_existing_mail")}
                  on_change={set_import_existing}
                />
              </Island>
            </IslandSection>
          </IslandSections>
        )}
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_submitting} variant="ghost" onClick={on_cancel}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!can_start}
          is_loading={is_submitting}
          variant="depth"
          onClick={() => {
            if (!listed || ordered_selection.length === 0) return;
            on_confirm({
              selected_folders: ordered_selection,
              import_existing,
              listed,
            });
          }}
        >
          {t("settings.oauth_folder_picker_start")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
