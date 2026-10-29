import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../api";
import type { DemoUser } from "../types";
import { Brand, Spinner } from "../components/Brand";

interface AppContextValue {
  user: DemoUser | null;
  demoUsers: DemoUser[];
  signIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function FullScreenMessage({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="full-screen">
      <div className="full-screen-card">
        <Brand />
        <h1>{title}</h1>
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [session, users] = await Promise.all([
        api.getSession(),
        api.getDemoUsers(),
      ]);
      setUser(session.user);
      setDemoUsers(users.users);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The workspace could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = useCallback(async (userId: string) => {
    const response = await api.signIn(userId);
    setUser(response.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, demoUsers, signIn, signOut, reload: load }),
    [user, demoUsers, signIn, signOut, load],
  );

  if (loading) {
    return (
      <div className="full-screen" aria-busy="true">
        <div className="full-screen-card loading-card">
          <Brand />
          <Spinner label="Opening your workspace" />
          <p className="muted">Opening your workspace…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <FullScreenMessage
        title="The workspace is unavailable"
        message={loadError}
        action={
          <button type="button" className="button button-primary" onClick={() => void load()}>
            Try again
          </button>
        }
      />
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider.");
  }
  return context;
}
