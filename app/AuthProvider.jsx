'use client'

import { useUser } from '@stackframe/stack'
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import React, { useEffect, useState } from 'react'
import { UserContext } from './_context/UserContext';
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
    const CreateUser = useMutation(api.users.CreateUser);
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const [userData, setUserData] = useState(null);

    console.log("User in AuthProvider:", user);
    
    useEffect(() => {
        if (user && !isCreatingUser) {
            console.log("User logged in:", user);
            CreateNewUser();
        } else if (!user) {
            console.log("No user logged in");
        }
    }, [user]);

    const CreateNewUser = async () => {
        if (!user?.primaryEmail || isCreatingUser) return;
        
        setIsCreatingUser(true);
        try {
            const result = await CreateUser({   
                name: user?.displayName || 'Anonymous User',
                email: user?.primaryEmail,
            });
            console.log("New user created with ID:", result);
            setUserData(result);
        } catch (error) {
            console.error("Error creating user:", error);
        } finally {
            setIsCreatingUser(false);
        }
    }

    return (
        <div>
            <UserContext.Provider value={{ userData, setUserData}}>
                {children}
            </UserContext.Provider>
        </div>
    )
}

export default AuthProvider