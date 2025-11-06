import React from 'react'
import Image from 'next/image'
import { UserButton } from '@stackframe/stack'

const AppHeader = () => {
  return (
    <header className='flex items-center justify-between gap-4 bg-gradient-to-br from-white via-sky-50 to-white px-5 py-4 text-slate-900 shadow-sm'>
      <div className='ml-2 sm:ml-4'>
        <Image
          src="/logo/logo.png"
          alt="Logo"
          width={44}
          height={32}
          priority
          className='h-8 w-auto sm:h-9'
        />
      </div>
      <UserButton />
    </header>
  )
}

export default AppHeader