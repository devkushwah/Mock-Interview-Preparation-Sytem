'use client'

import React, { useState, useEffect } from 'react'
import { useUser } from '@stackframe/stack'
import { ExpertsList } from '@/services/options'
import UserInputDialog from './UserInputDialog'
import { useRouter } from 'next/navigation'

const PracticePartner = () => {
  const user = useUser()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading ExpertsList (replace with actual fetch if needed)
    if (ExpertsList && ExpertsList.length > 0) {
      setIsLoading(false)
    }
  }, [])

  const handleProfileClick = () => {
    // Navigate to profile page (adjust route as per your app)
    router.push('/dashboard/profile')
  }

  if (isLoading) {
    return (
      <div className='p-6 flex justify-center items-center min-h-[400px]'>
        <div className='text-gray-500'>Loading interview options...</div>
      </div>
    )
  }

  return (
    <div className='p-6 max-w-7xl mx-auto'>
      <div className='flex flex-col md:flex-row justify-between items-start md:items-center mb-10'>
        <div>
          <h1 className='font-medium text-gray-700 text-sm md:text-base'>My Workspace</h1>
          <h1 className='font-bold text-2xl md:text-3xl mt-1'>
            Welcome back, {user?.displayName || 'User'}!
          </h1>
        </div>
        <button
          onClick={handleProfileClick}
          className="mt-4 md:mt-0 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Go to Profile"
        >
          Profile
        </button>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-10'>
        {ExpertsList.map((option, index) => (
          <UserInputDialog interviewType={option} key={index}>
            <div
              className='p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer flex flex-col items-center text-center min-h-[250px] group'
              role="button"
              tabIndex={0}
              aria-label={`Start ${option.name} interview`}
            >
              <img
                src={option.icon}
                alt={`${option.name} icon`}
                className='w-20 h-20 mb-4 object-cover rounded-lg group-hover:opacity-90 transition-opacity'
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iIzMzOTlGRiIvPgo8dGV4dCB4PSIzMiIgeT0iMzYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkk8L3RleHQ+Cjwvc3ZnPgo=';
                }}
              />
              <h2 className='font-semibold text-lg mb-3 text-gray-800 group-hover:text-blue-600 transition-colors'>
                {option.name}
              </h2>
              <button className="mt-auto px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500">
                Start Now
              </button>
            </div>
          </UserInputDialog>
        ))}
      </div>
    </div>
  )
}

export default PracticePartner