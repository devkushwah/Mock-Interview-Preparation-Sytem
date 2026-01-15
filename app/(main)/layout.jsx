import React from 'react'
import AppHeader from './_components/AppHeader'
import ClientToaster from './ClientToaster'

export default function MainLayout({ children }) {
  return (
    <>
      <AppHeader />
      {/* ✅ Remove all padding from layout - let pages control their own spacing */}
      {children}
      <ClientToaster />
    </>
  )
}