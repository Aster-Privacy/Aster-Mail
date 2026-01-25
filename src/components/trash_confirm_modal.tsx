import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";

interface TrashConfirmModalProps {
  is_open: boolean;
  on_confirm: () => void;
  on_cancel: () => void;
  on_dont_ask_again?: () => void | Promise<void>;
  count?: number;
}

export function TrashConfirmModal({
  is_open,
  on_confirm,
  on_cancel,
  on_dont_ask_again,
  count = 1,
}: TrashConfirmModalProps) {
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

  const item_text = count === 1 ? "this email" : `${count} emails`;

  return (
    <Modal
      close_on_overlay={true}
      is_open={is_open}
      on_close={on_cancel}
      show_close_button={false}
      size="sm"
    >
      <ModalHeader>
        <ModalTitle>Move to Trash</ModalTitle>
        <ModalDescription>
          Are you sure you want to move {item_text} to trash? You can restore
          from the Trash folder anytime.
        </ModalDescription>
      </ModalHeader>

      <div className="px-5 pb-4">
        <label
          className="flex items-center gap-2.5 cursor-pointer select-none group"
          htmlFor="trash-dont-ask-again"
        >
          <Checkbox
            checked={dont_ask_again}
            id="trash-dont-ask-again"
            onCheckedChange={(checked) => set_dont_ask_again(checked === true)}
          />
          <span
            className="text-[13px] transition-colors group-hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
          >
            Don&apos;t ask again
          </span>
        </label>
      </div>

      <ModalFooter>
        <Button
          disabled={is_saving}
          size="lg"
          variant="outline"
          onClick={on_cancel}
        >
          Cancel
        </Button>
        <Button
          disabled={is_saving}
          size="lg"
          variant="destructive"
          onClick={handle_confirm}
        >
          {is_saving ? "Saving..." : "Move to Trash"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
