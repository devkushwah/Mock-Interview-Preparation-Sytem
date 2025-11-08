import React from 'react'
import AppHeader from './_components/AppHeader'
import AuthProvider from '@/app/_context/AuthProvider' // use AuthProvider, not UserProvider
import ClientToaster from './ClientToaster'

export default function MainLayout({ children }) {
  return (
    <>
      <AuthProvider>
        <div>
          <AppHeader /> 
          <div className='px-10 pb-10 lg:px-32 xl:px-56 2xl:px-64'>
            {children}
          </div>
        </div>
      </AuthProvider>
      <ClientToaster />
    </>
  )
}