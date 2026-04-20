export type Chat = {
  peerId: string;
  username: string;
  lastMessage: string;
  lastActivity: number;
  unreadCount: number;
};

export type Message = {
  messageId: string;
  from: string;
  text: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  direction: 'sent' | 'received';
};
