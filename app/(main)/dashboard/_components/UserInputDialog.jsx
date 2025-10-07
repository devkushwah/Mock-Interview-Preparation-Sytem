import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Interviewer } from '@/services/options'

const UserInputDialog = ( {children, interviewType} ) => {
  return (
    <Dialog>
  <DialogTrigger>{children}</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Start Interview</DialogTitle>
      <DialogDescription>
        <div className='flex flex-col gap-4'>
            <h2 className='text-black'>
                You are about to start a {interviewType.name} interview.
            </h2>
            <textarea className='border border-gray-300 p-2 rounded' placeholder='Type your notes here...'></textarea>

            <div>
                {Interviewer.map((interviewer, index) => (
                    <div key={index} className='flex items-center gap-4'>
                        <img src={interviewer.avatar} alt={interviewer.name} className='w-12 h-12 rounded-full'/>
                        <h2 className='font-medium text-lg'>{interviewer.name}</h2>
                    </div>
                ))}
            </div>
        </div>
      </DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
  )
}

export default UserInputDialog