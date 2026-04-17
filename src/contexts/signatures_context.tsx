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
    const timer = setTimeout(load_signatures, 5_000);

    return () => clearTimeout(timer);
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

      const content = signature.is_html
        ? signature.content
        : signature.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/\n/g, "<br>");

      return `<br><br>--<br>${content}`;
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
