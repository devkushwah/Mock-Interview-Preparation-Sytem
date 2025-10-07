import React from 'react'
import History from './_components/History'
import Feedback from './_components/Feedback'
import PracticePartner from './_components/PracticePartner'

const Dashboard = () => {
  return (
    <div>

      <PracticePartner />

      <div className='grid grid-cols-1 md:grid-cols-2 gap-10 mt-10'>
        <History />
        <Feedback />
      </div>
    </div>
  )
}

export default Dashboard