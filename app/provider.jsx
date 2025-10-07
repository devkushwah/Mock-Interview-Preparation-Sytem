"use client"

import React from 'react'
import {ConvexProvider, ConvexReactClient} from 'convex/react'
import AuthProvider from './AuthProvider';

const Provider = ({ children }) => {
  const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);
  return (
   <suspense fallback={<div>Loading...</div>}>
    <ConvexProvider client={convex}>
        <AuthProvider>
            {children}
        </AuthProvider>
    </ConvexProvider>
   </suspense>
  )
}

export default Provider