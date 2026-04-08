import { useEffect, useRef, useState } from 'react';

interface WsMessage {
  text: string;
  fromMe: boolean;
  time: string;
}

export const useWebSocket = (token: string | null) => {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    ws.current = new WebSocket(`ws://localhost:5900/ws?token=${token}`);

    ws.current.onopen = () => setConnected(true);
    ws.current.onclose = () => setConnected(false);
    ws.current.onmessage = e => {
      setMessages(prev => [
        ...prev,
        {
          text: e.data,
          fromMe: false,
          time: new Date().toLocaleTimeString('ru', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    };

    return () => ws.current?.close();
  }, [token]);

  const send = (text: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    console.log('sending');
    ws.current.send(text);
    setMessages(prev => [
      ...prev,
      {
        text,
        fromMe: true,
        time: new Date().toLocaleTimeString('ru', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);
  };

  return { messages, send, connected };
};
