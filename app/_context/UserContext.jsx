'use client'
import React, { createContext, useState, useEffect } from 'react'
import { useUser } from '@stackframe/stack'
import { getUserByEmail, createUser } from '@/services/firebase/userService'

export const UserContext = createContext(null)

export const UserProvider = ({ children }) => {
  const stackUser = useUser()
  const [userData, setUserData] = useState(null)

  useEffect(() => {
    const init = async () => {
      try {
        if (!stackUser?.email) return
        let doc = await getUserByEmail(stackUser.email)
        if (!doc) {
          doc = await createUser({
            name: stackUser.displayName || stackUser.email.split('@')[0],
            email: stackUser.email,
            avatar: stackUser.photoURL || null
          })
        }
        // Use Firestore doc id everywhere
        setUserData({
          id: doc.id,
          email: doc.email,
          displayName: doc.name || stackUser.displayName || '',
          photoURL: doc.avatar || stackUser.photoURL || null,
        })
      } catch (e) {
        console.error('UserContext init error:', e)
      }
    }
    init()
  }, [stackUser?.email, stackUser?.displayName, stackUser?.photoURL])

  return (
    <UserContext.Provider value={{ userData, setUserData }}>
      {children}
    </UserContext.Provider>
  )
}