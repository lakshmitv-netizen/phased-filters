// Discussion thread types for cell comments

export interface DiscussionReply {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
}

export interface DiscussionThread {
  id: string;
  cellKey: string;
  rowId: string;
  timeKey?: string;
  measureId?: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
  replies: DiscussionReply[];
  resolved?: boolean;
}

