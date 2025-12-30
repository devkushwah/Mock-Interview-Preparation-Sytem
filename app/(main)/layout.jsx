import React from 'react'
import AppHeader from './_components/AppHeader'
import ClientToaster from './ClientToaster'
import Provider from '../provider' // ✅ add

export default function MainLayout({ children }) {
  return (
    <Provider>
      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        <AppHeader />
        <div className="px-4 sm:px-10 pb-10 lg:px-32 xl:px-56 2xl:px-64">
          {children}
        </div>
      </div>
      <ClientToaster />
    </Provider>
  )
}