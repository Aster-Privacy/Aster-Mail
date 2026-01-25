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
    load_templates();
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
