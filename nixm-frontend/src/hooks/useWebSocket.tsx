// hooks/useWebSocket.ts
const useWebSocket = (token: string | null) => {
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    ws.current = new WebSocket(`ws://localhost:3000/ws?token=${token}`);

    ws.current.onopen = () => console.log('ws connected');
    ws.current.onmessage = e => console.log('message:', e.data);
    ws.current.onclose = () => console.log('ws disconnected');

    return () => ws.current?.close();
  }, [token]);

  return ws;
};
