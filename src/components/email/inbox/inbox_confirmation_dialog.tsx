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
import { Button } from "@aster/ui";
import { Checkbox } from "@aster/ui";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert_dialog";
import { use_i18n } from "@/lib/i18n/context";

interface ConfirmModalProps {
  show: boolean;
  title: string;
  description: string;
  confirm_text: string;
  confirm_variant: "default" | "destructive";
  dont_ask: boolean;
  on_dont_ask_change: (value: boolean) => void;
  on_confirm: () => void;
  on_cancel: () => void;
}

export function ConfirmModal({
  show,
  title,
  description,
  confirm_text,
  confirm_variant,
  dont_ask,
  on_dont_ask_change,
  on_confirm,
  on_cancel,
}: ConfirmModalProps): React.ReactElement {
  const { t } = use_i18n();
  const is_destructive = confirm_variant === "destructive";

  return (
    <AlertDialog open={show} onOpenChange={(open) => !open && on_cancel()}>
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={on_cancel}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-16 font-semibold">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-14 leading-normal">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none mt-5"
            htmlFor="dont-ask-checkbox"
          >
            <Checkbox
              checked={dont_ask}
              id="dont-ask-checkbox"
              onCheckedChange={(checked) =>
                on_dont_ask_change(checked === true)
              }
            />
            <span className="text-13 text-txt-muted">
              {t("common.dont_ask_again")}
            </span>
          </label>
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button className="mt-0 max-sm:flex-1" size="xl" variant="outline">
              {t("common.cancel")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              className="max-sm:flex-1"
              size="xl"
              variant={is_destructive ? "destructive" : "primary"}
              onClick={on_confirm}
            >
              {confirm_text}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface EmptyTrashModalProps {
  show: boolean;
  trash_count: number;
  is_emptying: boolean;
  on_confirm: () => void;
  on_cancel: () => void;
}

export function EmptyTrashModal({
  show,
  trash_count,
  is_emptying,
  on_confirm,
  on_cancel,
}: EmptyTrashModalProps): React.ReactElement {
  const { t } = use_i18n();

  return (
    <AlertDialog open={show} onOpenChange={(open) => !open && on_cancel()}>
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={on_cancel}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-16 font-semibold">
              {t("mail.empty_trash_question")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-14 leading-normal">
              {t("mail.empty_trash_description", { count: trash_count })}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button
              className="mt-0 max-sm:flex-1"
              disabled={is_emptying}
              size="xl"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              className="max-sm:flex-1"
              disabled={is_emptying}
              size="xl"
              variant="destructive"
              onClick={on_confirm}
            >
              {is_emptying ? t("common.deleting") : t("mail.delete_all")}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
