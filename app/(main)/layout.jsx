import React from 'react'
import AppHeader from './_components/AppHeader'

const dashboardLayout = ({ children }) => {
  return (
    <div>
      <AppHeader />
      <div className='p-10 mt-20 lg:px-32 xl:px-56 2xl:px-64'>
        {children}
        <h1 className='text-2xl font-bold mt-10'>Interview Dashboard</h1>
      </div>
    </div>
  )
}

export default dashboardLayout