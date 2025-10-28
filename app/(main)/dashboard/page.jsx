'use client'

import { useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import History from './_components/History'
import PracticePartner from './_components/PracticePartner'


export default function Dashboard() {
  const { userData } = useContext(UserContext)

  return (
    <div>
      <p className='text-gray-600 mt-1'>Total Credits: {userData?.credit || 0}</p>
      <PracticePartner />

      <div className='grid grid-cols-1 md:grid-cols-2 gap-10 mt-10'>
        <History />
        
      </div>
    </div>
  )
}