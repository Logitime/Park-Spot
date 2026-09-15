import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAuthToken } from './api';
import { getApiUrl } from './constants';
import type { User } from './types';

const TOKEN_KEY = 'parkspot_token';

async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function writeToken(token: string) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Web / non-native environments: keep token in memory only.
  }
}

async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // ignore
  }
}

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await readToken();
        if (token) {
          setAuthToken(token);
          try {
            const data = await api.get<{ user: User }>('/api/auth/me');
            setUser(data.user);
            return;
          } catch {
            await clearToken();
            setAuthToken(null);
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>('/api/auth/login', {
      email,
      password,
    });
    setAuthToken(data.token);
    await writeToken(data.token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await api.post<{ token: string; user: User }>(
        '/api/auth/register',
        { name, email, password }
      );
      setAuthToken(data.token);
      await writeToken(data.token);
      setUser(data.user);
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut }),
    [user, ready, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function serverUrlLabel(): string {
  return getApiUrl();
}