import React from 'react'
import Image from 'next/image'
import { UserButton } from '@stackframe/stack'

const AppHeader = () => {
  return (
    <div className='p-5 shadow-sm flex justify-between items-center'>
      <Image src="/logo.svg" alt="Logo" width={56} height={40} />
      <UserButton />
    </div>
  )
}

export default AppHeader