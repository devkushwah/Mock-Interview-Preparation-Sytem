'use client'

import { useUser } from '@stackframe/stack'
import React, { useEffect, useState } from 'react'
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

    console.log("User in AuthProvider:", user);
    
    useEffect(() => {
        if (user && !isCreatingUser && !userData) {
            console.log("User logged in:", user);
            CreateNewUser();
        } else if (!user) {
            console.log("No user logged in");
            setUserData(null);
        }
    }, [user, userData]);

    const CreateNewUser = async () => {
        if (!user?.primaryEmail || isCreatingUser) return;
        
        setIsCreatingUser(true);
        try {
            // First check if user exists
            const existingUser = await getUserByEmail(user.primaryEmail);
            
            if (existingUser) {
                console.log("User already exists:", existingUser);
                setUserData(existingUser);
            } else {
                // Create new user with proper schema
                const newUserData = await createUser({
                    name: user?.displayName || 'Anonymous User',
                    email: user?.primaryEmail,
                    avatar: user?.profileImageUrl || null,
                });
                
                console.log("New user created:", newUserData);
                setUserData(newUserData);
            }
        } catch (error) {
            console.error("Error creating user:", error);
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