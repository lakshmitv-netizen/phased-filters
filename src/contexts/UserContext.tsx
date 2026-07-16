import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';

export interface AppUser {
  id: string;
  name: string;
}

interface UserContextType {
  currentUser: AppUser;
  users: AppUser[];
  setCurrentUserByName: (name: string) => void;
}

/** Switchable demo users — keep in sync with seeded approval requesters in ForecastingGrid */
export const APP_USERS: AppUser[] = [
  { id: 'john-carter', name: 'John Carter' },
  { id: 'alice-brennan', name: 'Alice Brennan' },
  { id: 'bob-okoro', name: 'Bob Okoro' },
  { id: 'carol-singh', name: 'Carol Singh' },
  { id: 'david-lee', name: 'David Lee' },
];

/** Demo approvers (plan submitter / planner is typically John Carter). */
export const APPROVER_USER_IDS = new Set(
  APP_USERS.filter((u) => u.id !== 'john-carter').map((u) => u.id)
);

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser>(APP_USERS[0]);

  const setCurrentUserByName = (name: string) => {
    const next = APP_USERS.find(u => u.name === name);
    if (next) setCurrentUser(next);
  };

  const value = useMemo(() => ({
    currentUser,
    users: APP_USERS,
    setCurrentUserByName,
  }), [currentUser]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};

export const useCurrentUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useCurrentUser must be used within a UserProvider');
  }
  return context;
};

