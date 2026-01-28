import { useState, useEffect, useRef } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
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

const ANIMATION_DURATION = 150;

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
  const [internal_open, set_internal_open] = useState(false);
  const closing_ref = useRef(false);
  const button_variant = VARIANT_MAP[variant];

  useEffect(() => {
    if (is_open) {
      closing_ref.current = false;
      requestAnimationFrame(() => {
        set_internal_open(true);
      });
    } else {
      closing_ref.current = false;
      set_internal_open(false);
      set_dont_ask(false);
      set_is_saving(false);
    }
  }, [is_open]);

  const close_with_animation = (action: () => void) => {
    if (closing_ref.current) return;
    closing_ref.current = true;
    set_internal_open(false);
    setTimeout(action, ANIMATION_DURATION);
  };

  const handle_confirm = async () => {
    if (dont_ask && on_dont_ask_again) {
      set_is_saving(true);
      try {
        await on_dont_ask_again();
      } finally {
        set_is_saving(false);
      }
    }
    close_with_animation(on_confirm);
  };

  const handle_cancel = () => {
    close_with_animation(on_cancel);
  };

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(open) => {
        if (!open) handle_cancel();
      }}
    >
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={handle_cancel}
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
          <Button
            className="mt-0"
            disabled={is_saving}
            size="lg"
            variant="outline"
            onClick={handle_cancel}
          >
            {cancel_text}
          </Button>
          <Button
            disabled={is_saving}
            size="lg"
            variant={button_variant}
            onClick={handle_confirm}
          >
            {is_saving ? "Saving..." : confirm_text}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
