'use client'

import { createContext } from 'react';

export const UserContext = createContext({
  userData: null,
  setUserData: () => {},
  isCreatingUser: false
});