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
  useMemo,
  ReactNode,
} from "react";

import { use_auth } from "@/contexts/auth_context";
import {
  list_templates,
  type DecryptedTemplate,
} from "@/services/api/templates";

interface TemplatesContextType {
  templates: DecryptedTemplate[];
  grouped_templates: Record<string, DecryptedTemplate[]>;
  is_loading: boolean;
  reload_templates: () => Promise<void>;
  get_template_by_id: (id: string) => DecryptedTemplate | undefined;
}

const TemplatesContext = createContext<TemplatesContextType | null>(null);

interface TemplatesProviderProps {
  children: ReactNode;
}

export function TemplatesProvider({ children }: TemplatesProviderProps) {
  const { vault, is_authenticated, is_completing_registration } = use_auth();
  const [templates, set_templates] = useState<DecryptedTemplate[]>([]);
  const [is_loading, set_is_loading] = useState(true);

  const load_templates = useCallback(async () => {
    if (!vault || !is_authenticated || is_completing_registration) {
      set_templates([]);
      set_is_loading(false);

      return;
    }

    set_is_loading(true);

    try {
      const response = await list_templates();

      if (response.data) {
        set_templates(response.data.templates);
      }
    } catch {
      set_templates([]);
    }

    set_is_loading(false);
  }, [vault, is_authenticated, is_completing_registration]);

  useEffect(() => {
    const timer = setTimeout(load_templates, 5_000);

    return () => clearTimeout(timer);
  }, [load_templates]);

  const grouped_templates = useMemo(() => {
    return templates.reduce(
      (acc, template) => {
        const category = template.category || "Uncategorized";

        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(template);

        return acc;
      },
      {} as Record<string, DecryptedTemplate[]>,
    );
  }, [templates]);

  const get_template_by_id = useCallback(
    (id: string): DecryptedTemplate | undefined => {
      return templates.find((t) => t.id === id);
    },
    [templates],
  );

  return (
    <TemplatesContext.Provider
      value={{
        templates,
        grouped_templates,
        is_loading,
        reload_templates: load_templates,
        get_template_by_id,
      }}
    >
      {children}
    </TemplatesContext.Provider>
  );
}

export function use_templates(): TemplatesContextType {
  const context = useContext(TemplatesContext);

  if (!context) {
    throw new Error("use_templates must be used within TemplatesProvider");
  }

  return context;
}
