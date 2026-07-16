import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface AgentforceContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const AgentforceContext = createContext<AgentforceContextValue | undefined>(undefined);

export const AgentforceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);

  return <AgentforceContext.Provider value={value}>{children}</AgentforceContext.Provider>;
};

export const useAgentforce = (): AgentforceContextValue => {
  const ctx = useContext(AgentforceContext);
  if (!ctx) {
    // Tolerate usage outside the provider (e.g. Header on non-grid pages) with a no-op fallback.
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
  }
  return ctx;
};
