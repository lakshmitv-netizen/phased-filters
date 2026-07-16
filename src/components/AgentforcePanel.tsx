import React, { useState, useRef, useEffect } from 'react';
import { MeasureData } from '../types';
import { FocusGridParams } from './AlertsPanel';
import {
  runAgentQuery,
  STARTER_PROMPTS,
  AgentResponse,
} from '../utils/agentforceEngine';
import '../styles/components/AgentforcePanel.css';

export const AgentforceSparkIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 20,
  className,
}) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden
  >
    <path
      d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
      fill="currentColor"
    />
    <path d="M18.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" fill="currentColor" />
  </svg>
);

interface ChatTurn {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  response?: AgentResponse;
  /** Agent turn is "thinking" — show the loading state until the reply resolves. */
  pending?: boolean;
}

/** Render lightweight `**bold**` markup as <strong>; everything else stays plain text. */
function renderRich(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    ),
  );
}

/** Split a "1. Name — value (period)" ranked bullet into its display parts. */
function parseRankedBullet(bullet: string): { rank: string; name: string; value: string; period?: string } | null {
  const m = bullet.match(/^(\d+)\.\s+(.*)$/);
  if (!m) return null;
  const rank = m[1];
  let rest = m[2];
  let name = rest;
  let value = '';
  const dash = rest.lastIndexOf(' — ');
  if (dash !== -1) {
    name = rest.slice(0, dash).trim();
    value = rest.slice(dash + 3).trim();
  }
  let period: string | undefined;
  const per = value.match(/\s*\(([^)]+)\)\s*$/);
  if (per) {
    period = per[1];
    value = value.slice(0, per.index).trim();
  }
  return { rank, name, value, period };
}

interface AgentforcePanelProps {
  isOpen: boolean;
  onClose: () => void;
  data: MeasureData[];
  /** Apply (params) or clear (null) the agent's filter view on the grid. */
  onShowOnGrid: (params: FocusGridParams | null) => void;
  /** Hand off to the Filters panel in advanced mode, pre-populated (incl. filter logic). */
  onEditFilters: (params: FocusGridParams, filterLogic?: string) => void;
  /** Open Settings on the Formatting tab to reveal the agent's conditional-formatting rule(s). */
  onShowConditionalFormatting: () => void;
  /** Open the Sort panel to reveal the ranking sort the agent applied. */
  onShowSort: () => void;
}

const AgentforcePanel: React.FC<AgentforcePanelProps> = ({
  isOpen,
  onClose,
  data,
  onShowOnGrid,
  onEditFilters,
  onShowConditionalFormatting,
  onShowSort,
}) => {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  // Cancel any in-flight "thinking" timer if the panel unmounts.
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const startNewChat = () => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    setTurns([]);
  };

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    // Don't stack requests while the agent is still "thinking".
    if (pendingTimerRef.current !== null) return;
    const seq = ++idRef.current;
    const userTurn: ChatTurn = { id: `u-${seq}`, role: 'user', text: q };
    const pendingId = `a-${seq}`;
    const pendingTurn: ChatTurn = { id: pendingId, role: 'agent', pending: true };
    setTurns((prev) => [...prev, userTurn, pendingTurn]);
    setInput('');
    // Simulate the agent "thinking" before revealing the grounded reply + grid view.
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      const response = runAgentQuery(q, data);
      setTurns((prev) =>
        prev.map((t) => (t.id === pendingId ? { ...t, pending: false, response } : t)),
      );
      // The filtered view is shown on the grid by default (no toggle needed).
      onShowOnGrid(response.focusParams);
    }, 1200);
  };

  const handleEdit = (params: FocusGridParams, filterLogic?: string) => {
    onEditFilters(params, filterLogic);
  };

  const hasConversation = turns.length > 0;
  // The sticky Recommendations bar always reflects the most recent agent reply.
  const latestRecommendations =
    [...turns].reverse().find((t) => t.role === 'agent' && t.response)?.response?.followUps ?? [];

  return (
    <div className="agentforce-panel" role="complementary" aria-label="Agentforce assistant">
      {/* Header */}
      <div className="agentforce-header">
        <div className="agentforce-header-left">
          <span className="agentforce-title">Agentforce</span>
        </div>
        <div className="agentforce-header-actions">
          <button
            className="agentforce-header-btn"
            onClick={startNewChat}
            aria-label="New chat"
            title="New chat"
            disabled={!hasConversation}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="9.5" y1="10" x2="14.5" y2="10" />
              <line x1="12" y1="7.5" x2="12" y2="12.5" />
            </svg>
          </button>
          <button className="agentforce-header-btn" aria-label="Pin panel" title="Pin" tabIndex={-1}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14l-1.6-2.1a2 2 0 0 1-.4-1.2V7a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6.7a2 2 0 0 1-.4 1.2z" />
            </svg>
          </button>
          <button className="agentforce-header-btn agentforce-close" onClick={onClose} aria-label="Close Agentforce" title="Close">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Conversation */}
      <div className="agentforce-body" ref={scrollRef}>
        {!hasConversation && (
          <div className="agentforce-intro">
            <img
              className="agentforce-intro-hero"
              src={`${import.meta.env.BASE_URL}agentforce-hero.png`}
              alt=""
              aria-hidden
            />
            <div className="agentforce-intro-title">Let's Chat!</div>
            <div className="agentforce-intro-sub">
              Hi, I'm Agentforce! I read your live plan data and can help you spot the accounts,
              products and periods that need attention. What can I help you with?
            </div>
            <div className="agentforce-suggestions">
              {STARTER_PROMPTS.map((p) => (
                <button key={p.id} className="agentforce-suggestion" onClick={() => ask(p.label)}>
                  <span className="agentforce-suggestion-text">{p.label}</span>
                  <svg className="agentforce-suggestion-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="agentforce-user-msg">
              {turn.text}
            </div>
          ) : turn.pending ? (
            <AgentThinkingCard key={turn.id} />
          ) : (
            <AgentReplyCard
              key={turn.id}
              response={turn.response!}
              onEditFilters={() => handleEdit(turn.response!.focusParams, turn.response!.filterLogic)}
              onShowConditionalFormatting={onShowConditionalFormatting}
              onShowSort={onShowSort}
            />
          )
        )}
      </div>

      {/* Composer (Recommendations stay pinned just above the input) */}
      <div className="agentforce-footer">
        <AgentforceRecommendations items={latestRecommendations} onSelect={ask} />
        <form
          className="agentforce-composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <button type="button" className="agentforce-composer-add" aria-label="Add" tabIndex={-1}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <input
            className="agentforce-input"
            placeholder="Describe your task or ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {input.trim() ? (
            <button type="submit" className="agentforce-composer-icon agentforce-composer-send" aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          ) : (
            <button type="button" className="agentforce-composer-icon agentforce-composer-mic" aria-label="Voice input" tabIndex={-1}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          )}
        </form>
        <div className="agentforce-disclaimer">Agentforce is AI and can make mistakes.</div>
      </div>
    </div>
  );
};

// Loading placeholder shown while the agent "thinks" before its reply resolves.
const AgentThinkingCard: React.FC = () => (
  <div className="agentforce-reply-block">
    <div className="agentforce-reply">
      <div className="agentforce-reply-avatar">
        <img
          className="agentforce-reply-avatar-img"
          src={`${import.meta.env.BASE_URL}agentforce-avatar.png`}
          alt=""
          aria-hidden
        />
      </div>
      <div className="agentforce-reply-content">
        <div className="agentforce-thinking" role="status" aria-label="Agentforce is thinking">
          <span className="agentforce-thinking-text">Analyzing your plan data</span>
          <span className="agentforce-thinking-dots" aria-hidden>
            <span className="agentforce-thinking-dot" />
            <span className="agentforce-thinking-dot" />
            <span className="agentforce-thinking-dot" />
          </span>
        </div>
      </div>
    </div>
  </div>
);

const AgentReplyCard: React.FC<{
  response: AgentResponse;
  onEditFilters: () => void;
  onShowConditionalFormatting: () => void;
  onShowSort: () => void;
}> = ({ response, onEditFilters, onShowConditionalFormatting, onShowSort }) => {
  const bullets = response.bullets ?? [];
  // When every bullet is a "1. Name — value (period)" ranked row, render a clean numbered list.
  const parsedRanked = bullets.map(parseRankedBullet);
  const rankedBullets = bullets.length > 0 && parsedRanked.every((p) => p !== null)
    ? (parsedRanked as NonNullable<(typeof parsedRanked)[number]>[])
    : null;
  const filterPreview = response.filterPreview ?? [];
  const filterCount = filterPreview.length;
  // The agent applies one conditional-formatting rule per root-cause highlight it pins.
  const cfCount = response.focusParams?.highlight ? 1 : 0;
  // The agent applies one ranking sort when it orders the surfaced rows.
  const sortCount = response.focusParams?.sort ? 1 : 0;
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = [response.answer, ...bullets].join('\n');
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
  <div className="agentforce-reply-block">
    <div className="agentforce-reply">
      <div className="agentforce-reply-avatar">
        <img
          className="agentforce-reply-avatar-img"
          src={`${import.meta.env.BASE_URL}agentforce-avatar.png`}
          alt=""
          aria-hidden
        />
      </div>

      <div className="agentforce-reply-content">
        <div className="agentforce-answer">
          {response.answer
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((para, i) => (
              <p key={i} className="agentforce-answer-p">
                {renderRich(para)}
              </p>
            ))}
        </div>

        {bullets.length > 0 && (
          rankedBullets ? (
            <div className="agentforce-ranklist">
              {rankedBullets.map((b, i) => (
                <div key={i} className="agentforce-rank-line">
                  {b.rank}. {b.name}
                  {b.value && (
                    <>
                      {' — '}
                      <strong>{b.value}</strong>
                      {b.period ? ` (${b.period})` : ''}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <ul className="agentforce-bullets">
              {bullets.map((b, i) => (
                <li key={i}>{renderRich(b)}</li>
              ))}
            </ul>
          )
        )}

        {(filterCount > 0 || cfCount > 0 || sortCount > 0) && (
          <div className="agentforce-applied-summary">
            {(() => {
              const parts: React.ReactNode[] = [];
              if (filterCount > 0) {
                parts.push(
                  <button
                    key="filters"
                    type="button"
                    className="agentforce-applied-link"
                    onClick={onEditFilters}
                    title="Show these filters in the Filters panel"
                  >
                    {filterCount} {filterCount === 1 ? 'filter' : 'filters'} applied
                  </button>,
                );
              }
              if (sortCount > 0) {
                parts.push(
                  <button
                    key="sort"
                    type="button"
                    className="agentforce-applied-link"
                    onClick={onShowSort}
                    title="Open the Sort panel to see the ranking sort"
                  >
                    {sortCount} sort applied
                  </button>,
                );
              }
              if (cfCount > 0) {
                parts.push(
                  <button
                    key="cf"
                    type="button"
                    className="agentforce-applied-link"
                    onClick={onShowConditionalFormatting}
                    title="Open the Formatting tab to see the highlight rule"
                  >
                    {cfCount} conditional formatting {cfCount === 1 ? 'rule' : 'rules'} applied
                  </button>,
                );
              }
              return parts.flatMap((node, i) =>
                i === 0
                  ? [node]
                  : [
                      <span key={`sep-${i}`} className="agentforce-applied-sep" aria-hidden>
                        •
                      </span>,
                      node,
                    ],
              );
            })()}
          </div>
        )}

        <div className="agentforce-reply-actions">
          <div className="agentforce-feedback">
            <button
              type="button"
              className={`agentforce-feedback-btn${feedback === 'up' ? ' is-active' : ''}`}
              aria-label="Good response"
              aria-pressed={feedback === 'up'}
              onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10v11" />
                <path d="M7 10l4-7a2 2 0 0 1 2.8 1.8V8h4.5a2 2 0 0 1 2 2.4l-1.4 7a2 2 0 0 1-2 1.6H7" />
              </svg>
            </button>
            <button
              type="button"
              className={`agentforce-feedback-btn${feedback === 'down' ? ' is-active' : ''}`}
              aria-label="Bad response"
              aria-pressed={feedback === 'down'}
              onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 14V3" />
                <path d="M17 14l-4 7a2 2 0 0 1-2.8-1.8V16H5.7a2 2 0 0 1-2-2.4l1.4-7a2 2 0 0 1 2-1.6H17" />
              </svg>
            </button>
            <button
              type="button"
              className={`agentforce-feedback-btn${copied ? ' is-active' : ''}`}
              aria-label={copied ? 'Copied' : 'Copy'}
              onClick={handleCopy}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

const AgentforceRecommendations: React.FC<{
  items: string[];
  onSelect: (question: string) => void;
}> = ({ items, onSelect }) => {
  if (items.length === 0) return null;
  return (
    <div className="agentforce-recs agentforce-recs--sticky">
      <div className="agentforce-recs-label">Recommendations</div>
      <div className="agentforce-recs-list">
        {items.map((q, i) => (
          <button
            key={i}
            type="button"
            className="agentforce-rec-item"
            onClick={() => onSelect(q)}
            title={q}
          >
            <svg className="agentforce-rec-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            <span className="agentforce-rec-text">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentforcePanel;
