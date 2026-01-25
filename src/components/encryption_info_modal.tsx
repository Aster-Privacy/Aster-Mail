import { XMarkIcon } from "@heroicons/react/24/outline";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";

interface EncryptionInfoModalProps {
  is_open: boolean;
  on_close: () => void;
  is_external: boolean;
  has_pq_protection: boolean;
}

export function EncryptionInfoModal({
  is_open,
  on_close,
  is_external,
  has_pq_protection,
}: EncryptionInfoModalProps) {
  return (
    <AlertDialog open={is_open} onOpenChange={(open) => !open && on_close()}>
      <AlertDialogContent className="max-w-xs p-4" on_overlay_click={on_close}>
        <VisuallyHidden.Root>
          <AlertDialogTitle>Encryption Information</AlertDialogTitle>
          <AlertDialogDescription>
            Details about how this message is encrypted
          </AlertDialogDescription>
        </VisuallyHidden.Root>
        <div className="flex items-start justify-between gap-4">
          <div
            className="text-xs space-y-2"
            style={{ color: "var(--text-secondary)" }}
          >
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {is_external ? "Protected in Transit" : "End-to-End Encrypted"}
            </p>
            <p>
              {is_external
                ? "Encrypted in transit and stored encrypted."
                : "Only you and the sender can read this."}
            </p>
            <p style={{ color: "var(--text-muted)" }}>
              AES-256-GCM · {has_pq_protection ? "ML-KEM-768" : "X25519"}
            </p>
          </div>
          <button
            className="p-1 -m-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={on_close}
          >
            <XMarkIcon
              className="w-4 h-4"
              style={{ color: "var(--text-muted)" }}
            />
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
