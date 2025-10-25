import React from 'react'
import AppHeader from './_components/AppHeader'

const dashboardLayout = ({ children }) => {
  return (
    <div>
      <AppHeader />
      <div className='p-10 mt-20 lg:px-32 xl:px-56 2xl:px-64'>
        {children}
      </div>
    </div>
  )
}

export default dashboardLayout