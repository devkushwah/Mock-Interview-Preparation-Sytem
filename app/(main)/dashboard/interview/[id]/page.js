'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'
import { Interviewer } from '@/services/options'
import { UserButton } from '@stackframe/stack'
import { Button } from "@/components/ui/button"
import { useWebSocketTranscription } from '@/hooks/useWebSocketTranscription'

const InterviewPage = () => {
  const { id } = useParams()
  const [discussionRoomData, setDiscussionRoomData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const {
    transcript,
    interimTranscript,
    isConnected,
    isConnecting,
    error: transcriptionError,
    connect,
    disconnect,
    clearTranscript
  } = useWebSocketTranscription()

  useEffect(() => {
    const fetchDiscussionRoom = async () => {
      if (!id) return

      try {
        setLoading(true)
        const docRef = doc(db, 'discussionRooms', id)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() }
          setDiscussionRoomData(data)
          console.log('Discussion room data:', data)
        } else {
          setError('Discussion room not found')
        }
      } catch (err) {
        console.error('Error fetching discussion room:', err)
        setError('Failed to load interview room')
      } finally {
        setLoading(false)
      }
    }

    fetchDiscussionRoom()
  }, [id])

  // Get interviewer avatar from options
  const getInterviewerAvatar = (interviewerName) => {
    const interviewer = Interviewer.find(i => i.name === interviewerName)
    return interviewer?.avatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjE1IiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yNSA3NUMyNSA2NS42IDMyLjYgNTggNDIgNThIMTU4QzY3LjQgNTggNzUgNjUuNiA3NSA3NVY4NUgyNVY3NVoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading interview room...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500 text-lg">{error}</div>
      </div>
    )
  }

  return (
   <div className='-mt-12'>  
       <h2 className='text-lg font-bold'>{discussionRoomData?.practiceOption}</h2> 

        
       <div className='mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10'>

        <div className='lg:col-span-2'>
          <div className=' h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col  items-center justify-center relative' >
              <img
                  src={getInterviewerAvatar(discussionRoomData?.interviewerName)}
                  alt={discussionRoomData?.interviewerName || 'Interviewer'}
                  className='h-[80px] w-[80px] rounded-full object-cover animate-pulse'
              />
              <h2 className="text-gray-800">{discussionRoomData?.interviewerName}</h2>
              
              {/* WebSocket connection status */}
              {isConnected && (
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-600">Live Connected</span>
                </div>
              )}
              
              {isConnecting && (
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-spin"></div>
                  <span className="text-sm text-yellow-600">Connecting...</span>
                </div>
              )}
              
              <div className='p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10' >
                <UserButton/>
              </div>
          </div>

            <div className="mt-5 flex items-center justify-center gap-4" >
              {isConnected ? 
                <Button variant="destructive" onClick={disconnect}>
                  Disconnect
                </Button>
                :
                <Button 
                  onClick={connect} 
                  disabled={isConnecting}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {isConnecting ? 'Connecting...' : 'Start Live Interview'}
                </Button>
              }
              
              {transcript && (
                <Button variant="outline" onClick={clearTranscript}>
                  Clear Transcript
                </Button>
              )}
            </div>
        </div>

        <div>
             <div className='h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col items-center justify-start relative overflow-y-auto'>
              <h2 className="font-bold mb-4">Live Transcript</h2>
              
              {/* Real-time audio visualization */}
              {isConnected && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div className="bg-green-500 h-2 rounded-full transition-all duration-150 animate-pulse" 
                       style={{width: '70%'}}></div>
                </div>
              )}
              
              {transcriptionError && (
                <div className="text-red-500 text-xs mb-2 p-2 bg-red-50 rounded w-full">
                  {transcriptionError}
                </div>
              )}
              
              <div className="text-sm text-gray-700 p-2 w-full">
                {/* Final transcript */}
                <div className="mb-2">
                  {transcript || (!isConnected && 'Click "Start Live Interview" to begin...')}
                </div>
                
                {/* Interim transcript with different styling */}
                {interimTranscript && (
                  <div className="text-gray-500 italic border-l-2 border-blue-400 pl-2 bg-blue-50 rounded">
                    {interimTranscript}
                    <span className="inline-flex items-center ml-2">
                      <span className="animate-pulse text-blue-500">●</span>
                    </span>
                  </div>
                )}
              </div>
              
              {/* Connection status and word count */}
              <div className="mt-auto w-full flex justify-between text-xs text-gray-400">
                <span>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
                {transcript && <span>Words: {transcript.split(' ').length}</span>}
              </div>
            </div>
            <h2 className='mt-4 text-gray-600 text-sm'>
              Real-time transcription powered by Deepgram Nova-3. 
              At the end of your interview, you will receive feedback from the interviewer.
            </h2>
        </div>
       </div>
   </div>
  )
}

export default InterviewPage