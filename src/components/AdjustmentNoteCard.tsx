import React from 'react';
import { AdjustmentNote } from '../types/adjustmentNote';
import '../styles/components/AdjustmentNoteCard.css';

interface AdjustmentNoteCardProps {
  note: AdjustmentNote;
}

const AdjustmentNoteCard: React.FC<AdjustmentNoteCardProps> = ({ note }) => {
  // Format timestamp
  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  };

  return (
    <div className="adjustment-note-card">
      <div className="adjustment-note-card-header">
        <div className="adjustment-note-card-user">
          <div className="adjustment-note-card-avatar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="9" r="4" fill="currentColor"/>
              <path d="M6 18.5C6 15.2 8.7 12.5 12 12.5C15.3 12.5 18 15.2 18 18.5V20H6V18.5Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="adjustment-note-card-user-info">
            <div className="adjustment-note-card-user-name">{note.userName}</div>
            <div className="adjustment-note-card-timestamp">{formatTimestamp(note.timestamp)}</div>
          </div>
        </div>
      </div>
      <div className="adjustment-note-card-body">
        <p className="adjustment-note-card-text">{note.note}</p>
      </div>
    </div>
  );
};

export default AdjustmentNoteCard;

