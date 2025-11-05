import React from 'react'
import Image from 'next/image'
import { UserButton } from '@stackframe/stack'

const AppHeader = () => {
  return (
    <div className='flex items-center justify-between gap-4 p-5 shadow-sm'>
      <div className='ml-2 sm:ml-4'>
        <Image src="/logo/logo.png" alt="Logo" width={80} height={56} priority />
      </div>
      <UserButton />
    </div>
  )
}

export default AppHeader