'use client'

import { useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import History from './_components/History'
import PracticePartner from './_components/PracticePartner'


export default function Dashboard() {
  const { userData } = useContext(UserContext)

  return (
    <div className='space-y-12'>
      <PracticePartner credits={userData?.credit || 0} />

      <section className='grid grid-cols-1 gap-10'>
        <History />
      </section>
    </div>
  )
}