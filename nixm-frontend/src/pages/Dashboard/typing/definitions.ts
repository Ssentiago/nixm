export interface Chat {
  id: number;
  username: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
}

export interface Message {
  id: number;
  fromMe: boolean;
  text: string;
  time: string;
}
