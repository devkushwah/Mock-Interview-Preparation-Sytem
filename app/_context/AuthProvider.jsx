'use client'

import { useUser } from '@stackframe/stack'
import React, { useEffect, useState, useRef } from 'react'
import { UserContext } from './UserContext'; // Fixed import path
import { createUser, getUserByEmail } from '@/services/firebase/userService';

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

    return (
        <div>
            <UserContext.Provider value={{ userData, setUserData, isCreatingUser }}>
                {children}
            </UserContext.Provider>
        </div>
    )
}

export default AuthProvider