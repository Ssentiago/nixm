export type Chat = {
  userId: number;
  username: string;
  lastMessage: string;
  lastActivity: number;
  unreadCount: number;
};

export type Message = {
  messageId: string;
  from: number;
  text: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  direction: 'sent' | 'received';
};
