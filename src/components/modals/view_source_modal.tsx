import { useCallback } from "react";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { show_toast } from "@/components/toast/simple_toast";

interface ViewSourceModalProps {
  is_open: boolean;
  on_close: () => void;
  html_body: string;
  message_id: string;
}

export function ViewSourceModal({
  is_open,
  on_close,
  html_body,
  message_id,
}: ViewSourceModalProps) {
  const handle_copy = useCallback(async () => {
    await navigator.clipboard.writeText(html_body);
    show_toast("Source copied to clipboard", "success");
  }, [html_body]);

  return (
    <Modal is_open={is_open} on_close={on_close} size="full">
      <ModalHeader>
        <ModalTitle>Message Source</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          {message_id}
        </p>

        <pre
          className="text-[13px] leading-relaxed rounded-lg p-4 overflow-auto"
          style={{
            fontFamily: "monospace",
            maxHeight: "60vh",
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border-secondary)",
            color: "var(--text-secondary)",
          }}
        >
          {html_body}
        </pre>
      </ModalBody>

      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          Close
        </Button>
        <Button onClick={handle_copy}>
          Copy source
        </Button>
      </ModalFooter>
    </Modal>
  );
}
