import { useState, useEffect } from "react";

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

type ConfirmationVariant = "danger" | "warning" | "info";

interface ConfirmationModalProps {
  is_open: boolean;
  on_confirm: () => void;
  on_cancel: () => void;
  on_dont_ask_again?: () => void | Promise<void>;
  title: string;
  message: string;
  confirm_text?: string;
  cancel_text?: string;
  variant?: ConfirmationVariant;
  show_dont_ask_again?: boolean;
}

const VARIANT_MAP: Record<ConfirmationVariant, "destructive" | "primary"> = {
  danger: "destructive",
  warning: "destructive",
  info: "primary",
};

export function ConfirmationModal({
  is_open,
  on_confirm,
  on_cancel,
  on_dont_ask_again,
  title,
  message,
  confirm_text = "Confirm",
  cancel_text = "Cancel",
  variant = "info",
  show_dont_ask_again = false,
}: ConfirmationModalProps) {
  const [dont_ask, set_dont_ask] = useState(false);
  const [is_saving, set_is_saving] = useState(false);
  const button_variant = VARIANT_MAP[variant];

  useEffect(() => {
    if (!is_open) {
      set_dont_ask(false);
      set_is_saving(false);
    }
  }, [is_open]);

  const handle_confirm = async () => {
    if (dont_ask && on_dont_ask_again) {
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
            <AlertDialogTitle className="text-[16px] font-semibold">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-normal">
              {message}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {show_dont_ask_again && (
            <label
              className="inline-flex items-center gap-2 cursor-pointer select-none mt-5"
              htmlFor="confirmation-dont-ask-checkbox"
            >
              <Checkbox
                checked={dont_ask}
                id="confirmation-dont-ask-checkbox"
                onCheckedChange={(checked) => set_dont_ask(checked === true)}
              />
              <span
                className="text-[13px]"
                style={{ color: "var(--text-muted)" }}
              >
                Don&apos;t ask again
              </span>
            </label>
          )}
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button
              className="mt-0"
              disabled={is_saving}
              size="lg"
              variant="outline"
            >
              {cancel_text}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              disabled={is_saving}
              size="lg"
              variant={button_variant}
              onClick={handle_confirm}
            >
              {is_saving ? "Saving..." : confirm_text}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
