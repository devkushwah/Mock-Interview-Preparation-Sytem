'use client'

import React, { useState, useContext } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Interviewer } from '@/services/options'
import { DialogClose } from '@radix-ui/react-dialog';
import { UserContext } from '@/app/_context/UserContext';
import { createDiscussionRoom } from '@/services/firebase/discussionService'; // Fixed import
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore';

const UserInputDialog = ( {children, interviewType} ) => {
  const { userData } = useContext(UserContext);
  const [selectExpert, setSelectExpert] = useState(null);
  // Default topic based on interview type
  const defaultTopic = interviewType?.name === "English Practice" ? "English Practice" : "";
  const [topic, setTopic] = useState(defaultTopic);
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
    const finalTopic = interviewType?.name === "English Practice" ? "English Practice" : topic;
    if (!finalTopic || !selectExpert || !userData?.id) return;

    setIsCreating(true);
    try {
      const result = await createDiscussionRoom({
        userId: userData.id,
        practiceOption: interviewType.name,
        topic: finalTopic,  // Use finalTopic
        interviewerName: selectExpert,
        difficulty: 'medium',
        tags: extractTags(finalTopic),
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to create discussion room');
      }

      const discussionId = result.data.id;  // Yeh change karo
      console.log("Discussion room created:", discussionId);

      // Fetch and log the document by ID for confirmation
      const docRef = doc(db, 'discussionRooms', discussionId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        console.log("Fetched discussion room data by ID:", docSnap.data());
      } else {
        console.log("No discussion room found with this ID!");
      }

      router.push(`/dashboard/interview/${discussionId}`);  // Yeh bhi change karo

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
          <DialogTitle>Select Interview Type & Topic</DialogTitle>
          <div className="text-muted-foreground text-sm">
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Choose Your Interviewer</h2>
              {interviewType?.name !== "English Practice" && (
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter your topic here..."
                  className="w-full p-3 border rounded-lg resize-none"
                  rows={3}
                />
              )}
              <div className="flex flex-col gap-2">
                <h3 className="text-md font-medium">Select Expert</h3>
                {Interviewer.map((interviewer, index) => (
                  <div key={index} 
                    onClick={() => setSelectExpert(interviewer.name)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectExpert === interviewer.name 
                        ? 'border-blue-500 bg-blue-50' 
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
              <button 
                onClick={handleStartInterview}
                disabled={isCreating || !selectExpert || (interviewType?.name !== "English Practice" && !topic)}
                className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {isCreating ? 'Starting...' : 'Start Interview'}
              </button>
            </div>
          </div>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

export default UserInputDialog