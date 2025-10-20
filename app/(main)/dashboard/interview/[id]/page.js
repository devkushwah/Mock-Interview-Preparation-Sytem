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
    aiResponse,
    isAiProcessing,
    conversationHistory,
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

  const handleConnect = async () => {
    await connect(discussionRoomData)
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
          <div className='h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col items-center justify-center relative'>
              <img
                  src={getInterviewerAvatar(discussionRoomData?.interviewerName)}
                  alt={discussionRoomData?.interviewerName || 'Interviewer'}
                  className={`h-[80px] w-[80px] rounded-full object-cover ${isAiProcessing ? 'animate-pulse' : ''}`}
              />
              <h2 className="text-gray-800 mb-2">{discussionRoomData?.interviewerName}</h2>
              
              {/* AI Response Display */}
              {aiResponse && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md text-center mt-4">
                  <div className="text-sm text-blue-800 font-medium mb-1">AI Interviewer:</div>
                  <div className="text-sm text-gray-700">{aiResponse}</div>
                </div>
              )}

              {/* AI Processing Indicator */}
              {isAiProcessing && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-md text-center mt-4">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm text-yellow-700">AI is thinking...</span>
                  </div>
                </div>
              )}
              
              {/* Connection Status */}
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
              
              {transcriptionError && (
                <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg p-2 max-w-xs">
                  <div className="text-xs text-red-600">{transcriptionError}</div>
                </div>
              )}
              
              <div className='p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10'>
                <UserButton/>
              </div>
          </div>

            <div className="mt-5 flex items-center justify-center gap-4">
              {isConnected ? 
                <Button variant="destructive" onClick={disconnect}>
                  End Interview
                </Button>
                :
                <Button 
                  onClick={handleConnect} 
                  disabled={isConnecting}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {isConnecting ? 'Connecting...' : 'Start AI Interview'}
                </Button>
              }
              
              {(transcript || conversationHistory.length > 0) && (
                <Button variant="outline" onClick={clearTranscript}>
                  Clear Session
                </Button>
              )}
            </div>
        </div>

        <div>
             <div className='h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col relative overflow-hidden'>
              <h2 className="font-bold mb-4 text-center">Interview Session</h2>
              
              {/* Current Speech Display */}
              {(transcript || interimTranscript) && (
                <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4 rounded">
                  <div className="text-xs font-medium text-blue-600 mb-1">You're saying:</div>
                  {transcript && (
                    <div className="text-sm text-gray-700 mb-1">{transcript}</div>
                  )}
                  {interimTranscript && (
                    <div className="text-sm text-gray-500 italic">
                      {interimTranscript}
                      <span className="animate-pulse ml-1">●</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Conversation History */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {conversationHistory.length === 0 && !isConnected && (
                  <div className="text-center text-gray-500 text-sm mt-8">
                    Click "Start AI Interview" to begin your practice session
                  </div>
                )}
                
                {conversationHistory.map((message, index) => (
                  <div key={index} className={`p-3 rounded-lg ${
                    message.role === 'user' 
                      ? 'bg-blue-50 border-l-4 border-blue-400 ml-4' 
                      : 'bg-gray-50 border-l-4 border-gray-400 mr-4'
                  }`}>
                    <div className="text-xs font-medium text-gray-500 mb-1">
                      {message.role === 'user' ? 'You:' : 'AI Interviewer:'}
                    </div>
                    <div className="text-sm text-gray-700">{message.content}</div>
                  </div>
                ))}
              </div>

              {/* Live Status */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                  <span>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
                  <span>Messages: {conversationHistory.length}</span>
                </div>
                
                {isConnected && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
                    <div className="bg-green-500 h-1 rounded-full transition-all duration-150 animate-pulse" 
                         style={{width: '70%'}}></div>
                  </div>
                )}
                
                <div className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                  {!isConnected && !isConnecting && (
                    <span className="text-gray-400">Ready to start interview...</span>
                  )}
                  {isConnecting && (
                    <span className="text-yellow-600">Connecting to AI interviewer...</span>
                  )}
                  {isConnected && (
                    <span className="text-green-600">🎤 Listening... Start speaking!</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className='mt-4 text-gray-600 text-sm'>
              <p className="mb-2">
                🤖 <strong>AI-Powered Interview:</strong> Real-time conversation with AI interviewer
              </p>
              <p className="text-xs">
                Powered by Deepgram Nova-3 transcription and AI responses
              </p>
            </div>
        </div>
       </div>
   </div>
  )
}

export default InterviewPage