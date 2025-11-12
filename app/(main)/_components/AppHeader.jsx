'use client'

import React, { useState, useContext } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserButton } from '@stackframe/stack'
import { UserContext } from '@/app/_context/UserContext'

export default function AppHeader() {
  const router = useRouter()
  const { userData } = useContext(UserContext) || {}
  const [open, setOpen] = useState(false)

  const handleLogin = () => {
    router.push('/handler/sign-in?redirect_url=/dashboard')
  }

  return (
    <header className="w-full py-4 px-4 md:px-8 bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg md:text-xl font-bold text-gray-900">
            AI Mock Interview
          </Link>
        </div>

        {/* Nav styled same as homepage */}
        <nav className="hidden md:flex gap-10 text-gray-700 font-medium">
          <Link href="/" className="hover:text-indigo-600 px-2">Home</Link>

          {userData ? (
            <Link href="/dashboard#history" className="hover:text-indigo-600 px-2">History</Link>
          ) : null}

          <Link href="/#contact" className="hover:text-indigo-600 px-2">Contact</Link>
        </nav>

        <div className="flex items-center gap-3">
          {userData ? (
            <UserButton />
          ) : (
            <button
              onClick={handleLogin}
              className="hidden md:inline-block bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700 transition"
            >
              Login
            </button>
          )}

          {/* mobile menu button */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-md hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* mobile menu - match homepage mobile styling/spacing */}
      {open && (
        <div className="absolute top-full left-0 w-full bg-white shadow-md flex flex-col items-center py-6 space-y-4 md:hidden z-40">
          <Link href="/" onClick={() => setOpen(false)} className="text-gray-700 font-medium py-2">Home</Link>
          {userData ? (
            <Link href="/dashboard#history" onClick={() => setOpen(false)} className="text-gray-700 font-medium py-2">History</Link>
          ) : null}
          <Link href="/#contact" onClick={() => setOpen(false)} className="text-gray-700 font-medium py-2">Contact</Link>
          {userData ? (
            <Link href="/dashboard" onClick={() => setOpen(false)} className="text-gray-700 font-medium py-2">Dashboard</Link>
          ) : (
            <button onClick={() => { setOpen(false); handleLogin() }} className="text-left py-2">Login</button>
          )}
        </div>
      )}
    </header>
  )
}