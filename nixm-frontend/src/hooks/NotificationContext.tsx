import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';

export type Notification = {
  id: string;
  type: 'chat_request';
  from: number;
  username: string;
  avatar_url: string | null;
  at: number;
};

type NotificationsContextType = {
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  removeNotification: (id: string) => void;
  clear: () => void;
};

const NotificationsContext = createContext<NotificationsContextType | null>(
  null,
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((n: Notification) => {
    setNotifications(prev => {
      if (prev.some(p => p.type === n.type && p.from === n.from)) return prev;
      return [n, ...prev];
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  return (
    <NotificationsContext.Provider
      value={{ notifications, addNotification, removeNotification, clear }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx)
    throw new Error(
      'useNotifications must be used within NotificationsProvider',
    );
  return ctx;
}
