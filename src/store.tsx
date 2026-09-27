import { get, set } from 'idb-keyval';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { browserCodec, type Codec } from './lib/codec';
import { createClient, loadKey, saveKey, type Client } from './lib/openrouter';
import type { Deps } from './lib/pipeline';
import { defaultProject } from './lib/project';
import type { Project } from './lib/types';

const PROJECT_KEY = 'aiconify.project.v1';

export interface Toast {
  id: number;
  tone: 'error' | 'success' | 'info';
  text: string;
}

interface Store {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  reset: () => void;
  loaded: boolean;
  apiKey: string | null;
  setApiKey: (k: string | null) => void;
  /** Build pipeline dependencies, or open the connect dialog if there's no key. */
  deps: () => Deps | null;
  codec: Codec;
  connectOpen: boolean;
  setConnectOpen: (v: boolean) => void;
  toasts: Toast[];
  notify: (text: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, client: injected }: { children: ReactNode; client?: (key: string) => Client }) {
  const [project, setProject] = useState<Project>(defaultProject);
  const [loaded, setLoaded] = useState(false);
  const [apiKey, setKey] = useState<string | null>(() => loadKey());
  const [connectOpen, setConnectOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef(project);
  latest.current = project;

  useEffect(() => {
    let alive = true;
    get<Project>(PROJECT_KEY)
      .then((p) => {
        if (alive && p?.id) setProject({ ...defaultProject(), ...p, exportOptions: { ...defaultProject().exportOptions, ...p.exportOptions } });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => set(PROJECT_KEY, project).catch(() => {}), 400);
  }, [project, loaded]);

  const update = useCallback((fn: (p: Project) => Project) => setProject((p) => ({ ...fn(p), updatedAt: Date.now() })), []);

  const notify = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);

  const setApiKey = useCallback((k: string | null) => {
    saveKey(k);
    setKey(k);
  }, []);

  const client = useMemo(
    () => (apiKey ? (injected ?? ((key: string) => createClient({ apiKey: key, referer: window.location.origin })))(apiKey) : null),
    [apiKey, injected],
  );

  const deps = useCallback((): Deps | null => {
    if (!client) {
      setConnectOpen(true);
      return null;
    }
    return {
      client,
      codec: browserCodec,
      onCost: (usd) => setProject((p) => ({ ...p, spent: p.spent + usd })),
    };
  }, [client]);

  const value: Store = {
    project,
    update,
    reset: () => setProject(defaultProject()),
    loaded,
    apiKey,
    setApiKey,
    deps,
    codec: browserCodec,
    connectOpen,
    setConnectOpen,
    toasts,
    notify,
    dismiss: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}
