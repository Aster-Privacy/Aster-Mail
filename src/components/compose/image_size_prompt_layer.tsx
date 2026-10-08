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
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import {
  register_image_size_prompt,
  type ImageSizeChoice,
} from "@/services/image_size_reduction";

interface PendingPrompt {
  resolve: (choice: ImageSizeChoice) => void;
}

export function ImageSizePromptLayer() {
  const { t } = use_i18n();
  const [pending, set_pending] = useState<PendingPrompt | null>(null);
  const pending_ref = useRef<PendingPrompt | null>(null);

  useEffect(() => {
    register_image_size_prompt(
      () =>
        new Promise<ImageSizeChoice>((resolve) => {
          pending_ref.current?.resolve("cancel");
          const next = { resolve };

          pending_ref.current = next;
          set_pending(next);
        }),
    );

    return () => {
      register_image_size_prompt(null);
      pending_ref.current?.resolve("cancel");
      pending_ref.current = null;
    };
  }, []);

  const finish = (choice: ImageSizeChoice) => {
    const current = pending_ref.current;

    pending_ref.current = null;
    set_pending(null);
    current?.resolve(choice);
  };

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) finish("cancel");
      }}
    >
      <AlertDialogContent
        className="max-w-[380px] gap-0 overflow-hidden p-0"
        data-testid="image_size_prompt"
        on_overlay_click={() => finish("cancel")}
      >
        <div className="px-6 pb-4 pt-6">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-[16px] font-semibold">
              {t("mail.image_size_prompt_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-normal">
              {t("mail.image_size_prompt_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6">
          <Button
            data-testid="image_size_reduce"
            variant="primary"
            onClick={() => finish("reduce")}
          >
            {t("mail.image_size_reduce")}
          </Button>
          <Button
            data-testid="image_size_original"
            variant="outline"
            onClick={() => finish("original")}
          >
            {t("mail.image_size_original")}
          </Button>
          <Button variant="ghost" onClick={() => finish("cancel")}>
            {t("common.cancel")}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
