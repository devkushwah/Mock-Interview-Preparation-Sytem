'use client'

import React from 'react'
import { useUser } from '@stackframe/stack'
import { ExpertsList } from '@/services/options'
import UserInputDialog from './UserInputDialog'

const PracticePartner = () => {
  const user = useUser()
  return (
    <div className='p-6'>
        <div className='flex justify-between items-center mb-10'>
             <div>
          <h1 className='font-medium text-gray-700'>My Workspace</h1>
        <h1 className='font-bold text-3xl'>Welcome back, {user?.displayName}</h1>
      </div>
      <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"> Profile </button>
        </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-10'> 
        {ExpertsList.map((option, index) => (
          <UserInputDialog interviewType={option} key={index}>
            <div 
             className='p-6 bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col items-center text-center min-h-[200px]'>
              <img 
                src={option.icon} 
                alt={option.name} 
                className='w-16 h-16 mb-4 object-cover rounded-lg'
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iOCIgZmlsbD0iIzMzOTlGRiIvPgo8dGV4dCB4PSIzMiIgeT0iMzYiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkk8L3RleHQ+Cjwvc3ZnPgo=';
                }}
              />
              <h2 className='font-semibold text-lg mb-3 text-gray-800'>{option.name}</h2>
              <button className="mt-auto px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"> 
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