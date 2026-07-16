import React, { useState } from 'react';
import '../styles/components/CellEditHistoryCard.css';

interface CardReply {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: Date;
}

interface GenericCommentCardProps {
  id: string;
  userName: string;
  userInitials: string;
  message: string;
  timestamp: Date;
  replies?: CardReply[];
  onAddReply?: (commentId: string, message: string) => void;
  isLast?: boolean;
  isFirst?: boolean;
}

const GenericCommentCard: React.FC<GenericCommentCardProps> = ({ 
  id,
  userName, 
  userInitials, 
  message, 
  timestamp, 
  replies = [], 
  onAddReply, 
  isLast = false, 
  isFirst = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(isFirst);
  const [replyText, setReplyText] = useState('');

  // Get user initials from name
  const getUserInitials = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Format full timestamp with date and time
  const formatFullTimestamp = (date: Date): string => {
    const ts = date instanceof Date ? date : new Date(date);
    return ts.toLocaleString('en-US', { 
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Format timestamp for replies
  const formatReplyTimestamp = (date: Date): string => {
    const ts = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - ts.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return ts.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    });
  };

  const handleSubmitReply = () => {
    if (replyText.trim() && onAddReply) {
      onAddReply(id, replyText.trim());
      setReplyText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitReply();
    }
    if (e.key === 'Escape') {
      setReplyText('');
    }
  };

  return (
    <div className={`sf-timeline-item ${isExpanded ? 'expanded' : ''}`}>
      {/* Left side: Expand arrow + Avatar + Line */}
      <div className="sf-timeline-left">
        <div className="sf-timeline-left-row">
          <button 
            className="sf-timeline-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              {isExpanded ? (
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
              ) : (
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
              )}
            </svg>
          </button>
          <div className="sf-timeline-avatar" style={{ backgroundColor: 'var(--color-accent-blue)' }}>
            <span className="sf-timeline-avatar-initials">{userInitials}</span>
          </div>
        </div>
        {!isLast && <div className="sf-timeline-line" style={{ backgroundColor: 'var(--color-accent-blue)' }}></div>}
      </div>
      
      {/* Right side: Content */}
      <div className="sf-timeline-content">
        {/* Header Row */}
        <div className="sf-timeline-header">
          <div className="sf-timeline-title-row">
            <span className="sf-timeline-username-secondary" style={{ color: 'var(--color-on-surface-strong)', fontWeight: 600 }}>{userName}</span>
            <span className="sf-timeline-timestamp">{formatFullTimestamp(timestamp)}</span>
          </div>
        </div>

        {/* Message - shown in subtitle area like CellEditHistoryCard */}
        <div className="sf-timeline-subtitle">
          <div className="sf-timeline-note-preview">
            <span className="sf-timeline-note-text">
              {isExpanded ? message : (message.length > 60 ? message.substring(0, 60) + '...' : message)}
            </span>
            {message.length > 60 && (
              <button 
                className="sf-timeline-see-more-btn"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'see less' : 'see more'}
              </button>
            )}
          </div>
        </div>

        {/* Expanded view: Show replies and input */}
        {isExpanded && (
          <div className="sf-timeline-details">
            {/* Discussion - Replies and Input */}
            <div className="sf-timeline-discussion">
              {replies.length > 0 && (
                <div className="sf-timeline-replies">
                  {replies.map((reply) => (
                    <div key={reply.id} className="sf-timeline-reply">
                      <div className="sf-timeline-reply-avatar">
                        {getUserInitials(reply.userName)}
                      </div>
                      <div className="sf-timeline-reply-content">
                        <span className="sf-timeline-reply-username">{reply.userName}</span>
                        <span className="sf-timeline-reply-message">{reply.message}</span>
                        <span className="sf-timeline-reply-timestamp">
                          {formatReplyTimestamp(reply.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              <div className="sf-timeline-reply-input">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button 
                  className="sf-timeline-post-btn"
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim()}
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GenericCommentCard;

