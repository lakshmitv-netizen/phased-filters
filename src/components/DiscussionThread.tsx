import React, { useState } from 'react';
import { DiscussionThread as DiscussionThreadType } from '../types/discussion';
import '../styles/components/DiscussionThread.css';

interface DiscussionThreadProps {
  thread: DiscussionThreadType;
  onAddReply: (threadId: string, message: string) => void;
  onResolve?: (threadId: string) => void;
}

const DiscussionThreadComponent: React.FC<DiscussionThreadProps> = ({
  thread,
  onAddReply,
  onResolve
}) => {
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleSubmitReply = () => {
    if (replyText.trim()) {
      onAddReply(thread.id, replyText.trim());
      setReplyText('');
      setShowReplyInput(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
    if (e.key === 'Escape') {
      setReplyText('');
      setShowReplyInput(false);
    }
  };

  return (
    <div className={`discussion-thread ${thread.resolved ? 'resolved' : ''}`}>
      {/* Main Comment */}
      <div className="discussion-thread-main">
        <div className="discussion-thread-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div className="discussion-thread-content">
          <div className="discussion-thread-header">
            <span className="discussion-thread-username">{thread.userName}</span>
            <span className="discussion-thread-timestamp">{formatTimestamp(thread.timestamp)}</span>
          </div>
          <p className="discussion-thread-message">{thread.message}</p>
          <div className="discussion-thread-actions">
            <button 
              className="discussion-thread-reply-btn"
              onClick={() => setShowReplyInput(!showReplyInput)}
            >
              Reply
            </button>
            {onResolve && !thread.resolved && (
              <button 
                className="discussion-thread-resolve-btn"
                onClick={() => onResolve(thread.id)}
              >
                Resolve
              </button>
            )}
            {thread.resolved && (
              <span className="discussion-thread-resolved-badge">✓ Resolved</span>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {thread.replies.length > 0 && (
        <div className="discussion-thread-replies">
          {thread.replies.map((reply) => (
            <div key={reply.id} className="discussion-thread-reply">
              <div className="discussion-thread-avatar small">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
              <div className="discussion-thread-content">
                <div className="discussion-thread-header">
                  <span className="discussion-thread-username">{reply.userName}</span>
                  <span className="discussion-thread-timestamp">{formatTimestamp(reply.timestamp)}</span>
                </div>
                <p className="discussion-thread-message">{reply.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Input */}
      {showReplyInput && (
        <div className="discussion-thread-reply-input">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a reply..."
            rows={2}
            autoFocus
          />
          <div className="discussion-thread-reply-actions">
            <button 
              className="discussion-thread-cancel-btn"
              onClick={() => {
                setReplyText('');
                setShowReplyInput(false);
              }}
            >
              Cancel
            </button>
            <button 
              className="discussion-thread-submit-btn"
              onClick={handleSubmitReply}
              disabled={!replyText.trim()}
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscussionThreadComponent;

