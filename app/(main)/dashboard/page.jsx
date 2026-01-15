'use client'

export const dynamic = 'force-dynamic'

import { useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import PracticePartner from './_components/PracticePartner'

export default function Dashboard() {
  const ctx = useContext(UserContext)
  const userData = ctx?.userData
  
  return (
    <div className='min-h-screen bg-slate-50 px-4 sm:px-6 lg:px-12 xl:px-20 2xl:px-32 py-8'>
      <PracticePartner credits={userData?.credit || 0} />
    </div>
  )
}