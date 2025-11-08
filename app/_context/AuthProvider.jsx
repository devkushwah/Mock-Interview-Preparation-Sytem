'use client'

import { useUser } from '@stackframe/stack'
import React, { useEffect, useState, useRef } from 'react'
import { UserContext } from './UserContext'; // Fixed import path
import { createUser, getUserByEmail } from '@/services/firebase/userService';
import { db } from '@/lib/firebaseConfig'
import { doc, onSnapshot } from 'firebase/firestore'

const AuthProvider = ({ children }) => {
    const [isMounted, setIsMounted] = useState(false);
    
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return <div>{children}</div>;
    }

    return <AuthProviderClient>{children}</AuthProviderClient>;
}

const AuthProviderClient = ({ children }) => {
  const user = useUser();
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userData, setUserData] = useState(null);
  const hasCreatedUser = useRef(false);  // Prevent multiple calls
  const unsubRef = useRef(null)          // <--- add

  // console.log("User in AuthProvider:", user);
    
  useEffect(() => {
    if (user && !hasCreatedUser.current && !userData) {
        console.log("User logged in:", user);
        CreateNewUser();
        hasCreatedUser.current = true;  // Mark as created
    } else if (!user) {
        console.log("No user logged in");
        hasCreatedUser.current = false;  // Reset on logout
    }
  }, [user, userData]);

  const CreateNewUser = async () => {
    if (!user?.primaryEmail || isCreatingUser) return;
    
    setIsCreatingUser(true);
    try {
        const userDataPayload = {
            name: user.displayName || user.primaryEmail.split('@')[0],
            email: user.primaryEmail,
            avatar: user.profileImageUrl || null,
        };

        const createdUser = await createUser(userDataPayload);
        setUserData(createdUser);
        console.log('User created/loaded:', createdUser);
    } catch (error) {
        console.error('Error creating user:', error);
    } finally {
        setIsCreatingUser(false);
    }
  }

  useEffect(() => {
    // Subscribe to Firestore user doc to reflect credit changes in realtime
    if (!userData?.id) return
    if (unsubRef.current) { try { unsubRef.current() } catch {} }
    const ref = doc(db, 'users', userData.id)
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data() || {}
        setUserData(prev => ({
          ...(prev || {}),
          id: userData.id,
          name: d.name ?? prev?.name,
          email: d.email ?? prev?.email,
          avatar: d.avatar ?? prev?.avatar,
          credit: typeof d.credit === 'number' ? d.credit : (prev?.credit || 0),
          isActive: d.isActive ?? prev?.isActive ?? true,
          updatedAt: d.updatedAt || prev?.updatedAt
        }))
        console.log('[AuthProvider] credit snapshot =>', d.credit)
      }
    }, (err) => console.warn('[AuthProvider] snapshot error:', err?.message || err))
    unsubRef.current = unsub
    return () => { try { unsub() } catch {} }
  }, [userData?.id])

  return (
    <div>
      <UserContext.Provider value={{ userData, setUserData, isCreatingUser, credits: userData?.credit || 0 }}>
        {children}
      </UserContext.Provider>
    </div>
  )
}

export default AuthProvider