import React from 'react'
import { UserButton } from '@stackframe/stack'
import Link from 'next/link'

const page = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Mock Interview Practice System</h1>
        <p className="text-lg text-gray-600 mb-6">Prepare for your next interview with AI-powered mock sessions.</p>
        <Link href="/dashboard">
          <button className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition duration-200">
            Go to Dashboard
          </button>
        </Link>
      </div>
      <div className="absolute top-4 right-4">
        <UserButton />
      </div>
    </div>
  )
}

export default page