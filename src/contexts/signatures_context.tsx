import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

import { use_auth } from "@/contexts/auth_context";
import {
  list_signatures,
  get_default_signature,
  type DecryptedSignature,
} from "@/services/api/signatures";

interface SignaturesContextType {
  signatures: DecryptedSignature[];
  default_signature: DecryptedSignature | null;
  is_loading: boolean;
  reload_signatures: () => Promise<void>;
  get_signature_by_id: (id: string) => DecryptedSignature | undefined;
  get_formatted_signature: (signature: DecryptedSignature | null) => string;
}

const SignaturesContext = createContext<SignaturesContextType | null>(null);

interface SignaturesProviderProps {
  children: ReactNode;
}

export function SignaturesProvider({ children }: SignaturesProviderProps) {
  const { vault, is_authenticated, is_completing_registration } = use_auth();
  const [signatures, set_signatures] = useState<DecryptedSignature[]>([]);
  const [default_signature, set_default_signature] =
    useState<DecryptedSignature | null>(null);
  const [is_loading, set_is_loading] = useState(true);

  const load_signatures = useCallback(async () => {
    if (!vault || !is_authenticated || is_completing_registration) {
      set_signatures([]);
      set_default_signature(null);
      set_is_loading(false);

      return;
    }

    set_is_loading(true);

    try {
      const [list_response, default_response] = await Promise.all([
        list_signatures(),
        get_default_signature(),
      ]);

      if (list_response.data) {
        set_signatures(list_response.data.signatures);
      }

      if (default_response.data) {
        set_default_signature(default_response.data);
      }
    } catch {
      set_signatures([]);
      set_default_signature(null);
    }

    set_is_loading(false);
  }, [vault, is_authenticated, is_completing_registration]);

  useEffect(() => {
    load_signatures();
  }, [load_signatures]);

  const get_signature_by_id = useCallback(
    (id: string): DecryptedSignature | undefined => {
      return signatures.find((sig) => sig.id === id);
    },
    [signatures],
  );

  const get_formatted_signature = useCallback(
    (signature: DecryptedSignature | null): string => {
      if (!signature) return "";

      return `\n\n--\n${signature.content}`;
    },
    [],
  );

  return (
    <SignaturesContext.Provider
      value={{
        signatures,
        default_signature,
        is_loading,
        reload_signatures: load_signatures,
        get_signature_by_id,
        get_formatted_signature,
      }}
    >
      {children}
    </SignaturesContext.Provider>
  );
}

export function use_signatures(): SignaturesContextType {
  const context = useContext(SignaturesContext);

  if (!context) {
    throw new Error("use_signatures must be used within SignaturesProvider");
  }

  return context;
}
