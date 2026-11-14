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
import { Button, Checkbox } from "@aster/ui";

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
  on_cancel: () => void;
  on_confirm: (result: OAuthFolderPickerResult) => void;
}

export function OAuthFolderPickerModal({
  account_token,
  is_submitting = false,
  on_cancel,
  on_confirm,
}: OAuthFolderPickerModalProps) {
  const { t } = use_i18n();
  const [listed, set_listed] = useState<OAuthFolderList | null>(null);
  const [folders, set_folders] = useState<PickerFolder[]>([]);
  const [selected, set_selected] = useState<Set<string>>(new Set());
  const [import_existing, set_import_existing] = useState(false);
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
    set_selected(new Set(default_selected_folders(offered)));
  }, []);

  useEffect(() => {
    set_listed(null);
    set_folders([]);
    set_selected(new Set());
    set_import_existing(false);
    if (!account_token) return;
    let stale = false;

    load(account_token, () => stale);

    return () => {
      stale = true;
    };
  }, [account_token, load]);

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
      <ModalBody className="px-6 space-y-4">
        {is_loading && (
          <div className="flex justify-center py-6 text-txt-muted">
            <ButtonSpinner className="text-current" />
          </div>
        )}
        {load_failed && !is_loading && (
          <div className="space-y-3">
            <p className="text-sm text-txt-secondary">
              {t("settings.oauth_folder_picker_load_failed")}
            </p>
            <Button
              size="md"
              variant="outline"
              onClick={() => {
                if (account_token) load(account_token, () => false);
              }}
            >
              {t("common.retry")}
            </Button>
          </div>
        )}
        {!is_loading && !load_failed && folders.length > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-2 pe-1">
            {folders.map((folder, index) => {
              const id = `oauth-folder-${index}`;

              return (
                <div key={folder.name} className="flex items-center gap-2.5">
                  <Checkbox
                    checked={selected.has(folder.name)}
                    disabled={is_submitting}
                    id={id}
                    onCheckedChange={(v) => toggle(folder.name, v === true)}
                  />
                  <label
                    className="text-sm text-txt-primary cursor-pointer select-none break-all"
                    htmlFor={id}
                  >
                    {folder.label}
                  </label>
                </div>
              );
            })}
          </div>
        )}
        {!is_loading && !load_failed && listed && (
          <div className="space-y-1 border-t border-edge-secondary pt-3">
            <div className="flex items-center gap-2.5">
              <Checkbox
                checked={import_existing}
                disabled={is_submitting}
                id="oauth-folder-import-existing"
                onCheckedChange={(v) => set_import_existing(v === true)}
              />
              <label
                className="text-sm text-txt-primary cursor-pointer select-none"
                htmlFor="oauth-folder-import-existing"
              >
                {t("settings.import_existing_mail")}
              </label>
            </div>
            <p className="text-xs text-txt-muted">
              {import_existing
                ? t("settings.import_existing_mail_on")
                : t("settings.import_existing_mail_off")}
            </p>
          </div>
        )}
        {listed && !is_loading && ordered_selection.length === 0 && (
          <p className="text-xs text-txt-muted">
            {t("settings.oauth_folder_picker_none_selected")}
          </p>
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
