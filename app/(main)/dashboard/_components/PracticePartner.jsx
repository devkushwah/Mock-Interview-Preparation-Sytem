'use client'

import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@stackframe/stack'
import UserInputDialog from './UserInputDialog'
import { getDailyFreeInterviewStatus } from '@/services/firebase/discussionService'
import { getUserCredits, getUserByEmail } from '@/services/firebase/userService'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebaseConfig'
import { UserContext } from '@/app/_context/UserContext'

const PracticePartner = ({ credits = 0 }) => {
  const user = useUser()
  const { userData, setUserData, credits: ctxCredits = 0 } = useContext(UserContext) || {}
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [freeLeft, setFreeLeft] = useState({ regular: null, pro: null })
  const [uiCredits, setUiCredits] = useState(credits)

  // Firestore user id from context
  const userId = useMemo(() => userData?.id || null, [userData?.id])
  const userEmail = user?.email || userData?.email || null

  const applyCounts = useCallback((regularLeft, proLeft, source) => {
    setFreeLeft({ regular: regularLeft, pro: proLeft })
    console.log(`[FREE UI] applyCounts source=${source} userId=${userId} regularLeft=${regularLeft} proLeft=${proLeft}`)
  }, [userId])

  // In computeRealtimeCounts treat missing createdAt as today
  const computeRealtimeCounts = useCallback((docs) => {
    const REGULAR_LIMIT = 10
    const PRO_LIMIT = 1
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const isToday = (ts) => {
      if (!ts) return true // Treat pending serverTimestamp as today
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      return d >= startOfDay
    }

    let usedRegular = 0
    let usedPro = 0
    docs.forEach(d => {
      const data = d.data()
      if (!data?.isFreeSession) return
      if (!isToday(data.createdAt)) return
      if (data.tier === 'pro') usedPro++
      else usedRegular++
    })

    const leftRegular = Math.max(0, REGULAR_LIMIT - usedRegular)
    const leftPro = Math.max(0, PRO_LIMIT - usedPro)
    applyCounts(leftRegular, leftPro, 'realtime')
  }, [applyCounts])

  const refreshDailyFree = useCallback(async () => {
    if (!userId) return
    const res = await getDailyFreeInterviewStatus(userId)
    if (res?.success) {
      applyCounts(res.data.regular.left, res.data.pro.left, 'fetch')
    } else {
      console.warn('getDailyFreeInterviewStatus error:', res?.error)
    }
  }, [userId, applyCounts])

  useEffect(() => {
    if (!userId) return
    const q = query(
      collection(db, 'discussionRooms'),
      where('userId', '==', userId),
      where('isFreeSession', '==', true)
    )
    const unsub = onSnapshot(q,
      snap => computeRealtimeCounts(snap.docs),
      err => {
        console.warn('Realtime free counts error:', err)
        refreshDailyFree()
      }
    )
    refreshDailyFree()
    return () => unsub()
  }, [userId, computeRealtimeCounts, refreshDailyFree])

  // Called after createDiscussionRoom with AFTER counts
  const handleFreeSessionStart = useCallback((afterCounts) => {
    if (afterCounts) {
      applyCounts(afterCounts.leftRegular, afterCounts.leftPro, 'callback')
    } else {
      refreshDailyFree()
    }
  }, [applyCounts, refreshDailyFree])

  // Reflect context credits immediately
  useEffect(() => {
    if (typeof ctxCredits === 'number') {
      setUiCredits(ctxCredits)
      console.log('[CREDITS] from context', { ctxCredits })
    }
  }, [ctxCredits])

  useEffect(() => {
    let active = true
    const loadCredits = async () => {
      try {
        // Resolve Firestore ID by email if needed
        if (!userId) {
          if (!userEmail) return
          const rec = await getUserByEmail(userEmail)
          if (rec?.id) {
            console.log('[CREDITS] resolved Firestore ID via email', { email: userEmail, id: rec.id })
            setUserData && setUserData(prev => ({ ...(prev || {}), id: rec.id, email: rec.email || userEmail, credit: rec.credit }))
            // Also reflect credits now
            if (typeof rec.credit === 'number') setUiCredits(rec.credit)
          }
          return
        }

        // Skip fetch if context already has the same positive value
        if (ctxCredits > 0 && ctxCredits === uiCredits) return

        const c = await getUserCredits(userId)
        if (active) {
          setUiCredits(c)
          console.log('[CREDITS] loaded from Firestore', { userId, credits: c })
        }
      } catch (e) {
        console.warn('[CREDITS] load error', e?.message || e)
      }
    }
    loadCredits()
    return () => { active = false }
  }, [userId, userEmail, setUserData, ctxCredits]) // re-run if id or ctx changes

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 250)
    return () => clearTimeout(timer)
  }, [])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const features = useMemo(
    () => [
      'Real-time AI feedback',
      'Speech recognition',
      'Personalized difficulty',
      'Detailed analytics'
    ],
    []
  )

  const stats = useMemo(
    () => [
      { number: '10K+', label: 'Active Users' },
      { number: '50K+', label: 'Interviews' },
      { number: '94%', label: 'Success Rate' },
      { number: '8.5/10', label: 'Avg. Score' }
    ],
    []
  )

  const practiceOptions = useMemo(
    () => [
      {
        id: 'technical',
        name: 'Technical Interview',
        description: 'Practice Any Technical Concept.',
        iconType: 'code'
      },
      {
        id: 'behavioral',
        name: 'Behavioral Interview',
        description: 'Master the STAR method and refine storytelling.',
        iconType: 'chat'
      },
      {
        id: 'english',
        name: 'English Practice',
        description: 'Boost your fluency and professional communication.',
        iconType: 'english'
      },
      {
        id: 'mock',
        name: 'Mixed Interview',
        description: 'Simulate a real interview with structured feedback.',
        iconType: 'mock'
      }
    ],
    []
  )

  const handleViewTracks = useCallback(() => {
    const el = document?.getElementById('interview-tracks')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleProfileClick = useCallback(() => {
    router.push('/dashboard/profile')
  }, [router])

  const renderIcon = (type) => {
    switch (type) {
      case 'chat':
        return (
          <svg xmlns='http://www.w3.org/2000/svg' className='h-7 w-7 text-pink-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.89L3 20l1.11-3.03A7.962 7.962 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
          </svg>
        )
      case 'english':
        return (
          <svg xmlns='http://www.w3.org/2000/svg' className='h-7 w-7 text-green-600' viewBox='0 0 24 24' fill='currentColor'>
            <path d='M12 2a10 10 0 100 20 10 10 0 000-20zm1 5h-2v7h2V7zm-2 10a1 1 0 110-2 1 1 0 010 2z' />
          </svg>
        )
      case 'mock':
        return (
          <svg xmlns='http://www.w3.org/2000/svg' className='h-7 w-7 text-orange-600' viewBox='0 0 24 24' fill='currentColor'>
            <path d='M3 3h18v14H3zM7 20v-3h10v3H7z' />
          </svg>
        )
      default:
        return (
          <svg xmlns='http://www.w3.org/2000/svg' className='h-7 w-7 text-indigo-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M12 6v6m0 0v6m0-6h6m-6 0H6' />
          </svg>
        )
    }
  }

  if (isLoading) {
    return (
      <section className='relative left-1/2 right-1/2 w-screen -translate-x-1/2 bg-gradient-to-br from-white via-sky-50 to-white py-16'>
        <div className='mx-auto h-64 w-full max-w-6xl animate-pulse rounded-3xl bg-white/60' />
      </section>
    )
  }

  return (
    <>
      {/* Global toast container (dashboard scope) */}
      <Toaster richColors position="top-center" closeButton expand />
      <section className='relative left-1/2 right-1/2 w-screen -translate-x-1/2 bg-gradient-to-br from-white via-sky-50 to-white py-12'>
        <div className='mx-auto flex w-full max-w-6xl flex-col items-center px-4 sm:px-6 lg:px-8'>
          <header className='w-full text-center'>
            <div className='mx-auto inline-flex items-center gap-2 rounded-full bg-blue-100/70 px-3 py-1 text-sm font-medium text-blue-700'>
              <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 12l2 2 4-4' />
              </svg>
              AI-Powered Interview Prep
            </div>

            <h1 className='mt-4 text-4xl font-extrabold leading-tight text-blue-700 md:text-5xl lg:text-6xl'>
              Master Your Next<br className='hidden md:block' /> Interview
            </h1>

            <p className='mt-6 mx-auto max-w-2xl text-lg text-slate-600'>
              Practice with AI interviewers, get instant feedback, and track your progress. {greeting}, {user?.displayName || 'there'} — your personal interview coach is ready 24/7.
            </p>

        <main className='mt-10 w-full'>
          <section id='interview-tracks' className='grid grid-cols-1 gap-6 md:grid-cols-2'>
            {practiceOptions.map((option) => (
              <UserInputDialog
                interviewType={option}
                key={option.id}
                onSessionStarted={handleFreeSessionStart} // FIX: was onStart
              >
                <div className='group flex h-full cursor-pointer flex-col justify-between rounded-2xl bg-white p-6 shadow-md transition hover:-translate-y-1 hover:shadow-xl focus:outline-none'>
                  <div className='flex items-start gap-4'>
                    <div className='rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 p-3'>
                      {renderIcon(option.iconType)}
                    </div>
                    <div>
                      <h3 className='text-lg font-semibold text-slate-900'>{option.name}</h3>
                      <p className='mt-2 text-sm text-slate-500'>{option.description}</p>
                      <span className='mt-4 inline-block text-sm font-medium text-indigo-600'>
                        Start Practice →
                      </span>
                    </div>
                  </div>
                </UserInputDialog>
              ))}
            </section>

          <section className='mt-10 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6'>
            {stats.map((stat) => (
              <div key={stat.label} className='rounded-xl bg-white py-6 px-4 text-center shadow-sm'>
                <div className='text-2xl font-bold text-blue-600 md:text-3xl'>{stat.number}</div>
                <div className='mt-1 text-sm text-slate-500'>{stat.label}</div>
              </div>
            ))}
            <div className='rounded-xl bg-white py-6 px-4 text-center shadow-sm'>
              <div className='text-2xl font-bold text-blue-600 md:text-3xl'>{uiCredits}</div>
              <div className='mt-1 text-sm text-slate-500'>Available Credits</div>
            </div>
            <div className='rounded-xl bg-white py-6 px-4 text-center shadow-sm'>
              <div className='text-2xl font-bold text-blue-600 md:text-3xl'>
                {freeLeft.regular ?? '—'}
              </div>
              <div className='mt-1 text-sm text-slate-500'>Regular Free Left Today</div>
            </div>
            <div className='rounded-xl bg-white py-6 px-4 text-center shadow-sm'>
              <div className='text-2xl font-bold text-blue-600 md:text-3xl'>
                {freeLeft.pro ?? '—'}
              </div>
              <div className='mt-1 text-sm text-slate-500'>Pro Free Left Today</div>
            </div>
          </section>
        </main>
      </div>
    </section>
  )
}

export default PracticePartner