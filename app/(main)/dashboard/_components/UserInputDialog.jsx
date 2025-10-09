'use client'

import React, { useState, useContext } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Interviewer } from '@/services/options'
import { DialogClose } from '@radix-ui/react-dialog';
import { UserContext } from '@/app/_context/UserContext';
import { createDiscussionRoom } from '@/services/firebase/discussionService';
import { useRouter } from 'next/navigation';

const UserInputDialog = ( {children, interviewType} ) => {
  const { userData } = useContext(UserContext);
  const [selectExpert, setSelectExpert] = useState(null);
  const [topic, setTopic] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const resetForm = () => {
    setSelectExpert(null);
    setTopic('');
  };

  const handleOpenChange = (open) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleStartInterview = async () => {
    if (!topic || !selectExpert || !userData?.id) return;
    
    setIsCreating(true);
    try {
      const discussionData = await createDiscussionRoom({
        userId: userData.id,
        practiceOption: interviewType.name,
        topic: topic,
        interviewerName: selectExpert,
        difficulty: 'medium', // Default difficulty
        tags: extractTags(topic), // Extract tags from topic
      });
      
      console.log("Discussion room created:", discussionData.id);
      
      // Navigate to interview room
      router.push(`/dashboard/interview/${discussionData.id}`);
      
      setIsOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error starting interview:", error);
      alert("Error starting interview. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  // Extract tags from topic text
  const extractTags = (topicText) => {
    const commonTech = ['react', 'javascript', 'python', 'java', 'node', 'sql', 'mongodb', 'express', 'nextjs'];
    const words = topicText.toLowerCase().split(' ');
    return commonTech.filter(tech => 
      words.some(word => word.includes(tech) || tech.includes(word))
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild onClick={() => setIsOpen(true)}>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Interview</DialogTitle>
          <DialogDescription>
            <div className='flex flex-col gap-4'>
                <h2 className='text-black'>
                    You are about to start a {interviewType.name} interview.
                </h2>
                <textarea 
                    onChange={(e) => setTopic(e.target.value)} 
                    value={topic}
                    className='border border-gray-300 p-2 rounded min-h-[80px] resize-none' 
                    placeholder='Describe what you want to practice (e.g., React hooks, System design, Data structures)...'
                ></textarea>

                <div className='flex flex-col gap-3'>
                    <h3 className='text-black font-medium'>Select an Interviewer:</h3>
                    {Interviewer.map((interviewer, index) => (
                        <div key={index} 
                            onClick={() => setSelectExpert(interviewer.name)}
                            className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                                selectExpert === interviewer.name 
                                    ? 'border-blue-500 bg-blue-50 shadow-md' 
                                    : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            <img src={interviewer.avatar} alt={interviewer.name} 
                                className={`w-12 h-12 rounded-full border-2 transition-all ${
                                    selectExpert === interviewer.name ? 'border-blue-500' : 'border-gray-200'
                                }`} 
                            />
                            <h2 className={`font-medium text-lg transition-colors ${
                                selectExpert === interviewer.name ? 'text-blue-600' : 'text-gray-700'
                            }`}>
                                {interviewer.name}
                            </h2>
                            {selectExpert === interviewer.name && (
                                <div className='ml-auto'>
                                    <div className='w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center'>
                                        <div className='w-2 h-2 bg-white rounded-full'></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className='flex justify-end gap-2 mt-4'> 
                  <DialogClose asChild>
                    <button 
                      className='border border-gray-300 p-2 rounded px-4 hover:bg-gray-50 transition-colors'
                      onClick={resetForm}
                      disabled={isCreating}
                    >
                      Cancel
                    </button>
                  </DialogClose>
                  <button 
                    className='bg-blue-500 text-white p-2 rounded px-4 disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors'
                    disabled={(!topic || !selectExpert || isCreating)}
                    onClick={handleStartInterview}
                  >
                    {isCreating ? 'Starting Interview...' : 'Start Interview'}
                  </button>
                </div>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

export default UserInputDialog