import { useState, useEffect } from "react";
import { ArchiveBoxIcon } from "@heroicons/react/24/outline";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface ArchiveConfirmModalProps {
  is_open: boolean;
  on_confirm: () => void;
  on_cancel: () => void;
  on_dont_ask_again?: () => void | Promise<void>;
}

export function ArchiveConfirmModal({
  is_open,
  on_confirm,
  on_cancel,
  on_dont_ask_again,
}: ArchiveConfirmModalProps) {
  const [dont_ask_again, set_dont_ask_again] = useState(false);
  const [is_saving, set_is_saving] = useState(false);

  useEffect(() => {
    if (!is_open) {
      set_dont_ask_again(false);
      set_is_saving(false);
    }
  }, [is_open]);

  const handle_confirm = async () => {
    if (dont_ask_again && on_dont_ask_again) {
      set_is_saving(true);
      try {
        await on_dont_ask_again();
      } finally {
        set_is_saving(false);
      }
    }
    on_confirm();
  };

  return (
    <AlertDialog open={is_open} onOpenChange={(open) => !open && on_cancel()}>
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={on_cancel}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <ArchiveBoxIcon
                className="w-5 h-5"
                style={{ color: "var(--text-secondary)" }}
              />
              <AlertDialogTitle className="text-[16px] font-semibold">
                Archive Email?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[14px] leading-normal pl-8">
              This email will be moved to your Archive folder. You can access it
              anytime from there.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none mt-5 pl-8"
            htmlFor="archive-dont-ask-checkbox"
          >
            <Checkbox
              checked={dont_ask_again}
              id="archive-dont-ask-checkbox"
              onCheckedChange={(checked) =>
                set_dont_ask_again(checked === true)
              }
            />
            <span
              className="text-[13px]"
              style={{ color: "var(--text-muted)" }}
            >
              Don&apos;t ask me again
            </span>
          </label>
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button
              className="mt-0"
              disabled={is_saving}
              size="lg"
              variant="outline"
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              disabled={is_saving}
              size="lg"
              variant="primary"
              onClick={handle_confirm}
            >
              {is_saving ? "Saving..." : "Archive"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
