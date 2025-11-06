'use client'

import { useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import History from './_components/History'
import PracticePartner from './_components/PracticePartner'


export default function Dashboard() {
  const { userData } = useContext(UserContext)

  return (
    <div className='min-h-screen bg-slate-50'>
      <PracticePartner credits={userData?.credit || 0} />
      <History />
    </div>
  )
}