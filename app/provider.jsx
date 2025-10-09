'use client'

import React from 'react'
import AuthProvider from './_context/AuthProvider';

const Provider = ({ children }) => {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  )
}

export default Provider