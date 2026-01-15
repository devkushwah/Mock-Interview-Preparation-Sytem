'use client'

import React, { useState, useContext } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { UserButton } from '@stackframe/stack'
import { UserContext } from '@/app/_context/UserContext'
import { Calendar, Home } from 'lucide-react'

export default function AppHeader() {
  const router = useRouter()
  const pathname = usePathname() // ✅ ADD THIS LINE
  const { userData } = useContext(UserContext) || {}
  const [open, setOpen] = useState(false)

  const handleLogin = () => {
    router.push('/handler/sign-in?redirect_url=/dashboard')
  }

  // ✅ ADD THIS HELPER FUNCTION
  const isActive = (path) => {
    if (path === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname?.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-16 items-center justify-between px-4 sm:px-10 lg:px-32 xl:px-56 2xl:px-64">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <span className="text-lg font-bold text-white">A</span>
            </div>
            <span className="text-xl font-bold text-slate-900 hidden sm:inline">AI Mock Interview</span>
          </Link>
          
          {/* Nav styled same as homepage */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/dashboard"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive('/dashboard')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
            <Link
              href="/dashboard/history"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive('/dashboard/history')
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Calendar className="h-4 w-4" />
              History
            </Link>
          </nav>
        </div>

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
          <Link href="/dashboard" onClick={() => setOpen(false)} className="text-gray-700 font-medium py-2">Home</Link>
          {userData && (
            <Link href="/dashboard/history" onClick={() => setOpen(false)} className="text-gray-700 font-medium py-2">History</Link>
          )}
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