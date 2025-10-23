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
  
  // Create interview context from discussion room data
  const interviewContext = discussionRoomData ? {
    topic: discussionRoomData.topic,
    difficulty: discussionRoomData.difficulty,
    practiceOption: discussionRoomData.practiceOption,
    interviewerName: discussionRoomData.interviewerName
  } : null

  // Handle transcript ready callback
  const handleTranscriptReady = (transcript) => {
    console.log('📝 Transcript ready:', transcript)
    // Additional processing if needed
  }
  
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
  } = useWebSocketTranscription(
    interviewContext,
    discussionRoomData,
    handleTranscriptReady
  )

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
    if (discussionRoomData) {
      await connect(discussionRoomData)
    }
  }

  useEffect(() => {
    if (aiResponse && !isAiProcessing) {
      // Auto-scroll to bottom when new AI response is received
      const conversationContainer = document.getElementById('conversation-container')
      if (conversationContainer) {
        conversationContainer.scrollTop = conversationContainer.scrollHeight
      }
    }
  }, [aiResponse, isAiProcessing])

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
                  className={`h-[80px] w-[80px] rounded-full object-cover ${isAiProcessing ? 'animate-pulse border-4 border-blue-400' : ''}`}
              />
              <h2 className="text-gray-800 mb-2">{discussionRoomData?.interviewerName}</h2>
              
              {/* Streaming TTS Indicator */}
              {isAiProcessing && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 max-w-md text-center mt-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                  <div className="text-sm text-blue-700 font-medium">🎙️ Streaming Response...</div>
                  <div className="text-xs text-gray-600 mt-1">AI is speaking via Deepgram TTS</div>
                </div>
              )}

              {/* AI Response Display */}
              {aiResponse && !isAiProcessing && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md text-center mt-4">
                  <div className="text-sm text-green-800 font-medium mb-1">AI Interviewer:</div>
                  <div className="text-sm text-gray-700">{aiResponse}</div>
                  <div className="text-xs text-green-600 mt-2">✅ Audio played</div>
                </div>
              )}
              
              {/* Connection Status */}
              {isConnected && (
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-600">🔊 Live Audio Streaming</span>
                </div>
              )}
              
              {isConnecting && (
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-spin"></div>
                  <span className="text-sm text-yellow-600">Connecting TTS...</span>
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
                  End Streaming Interview
                </Button>
                :
                <Button 
                  onClick={handleConnect} 
                  disabled={isConnecting || !discussionRoomData}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {isConnecting ? 'Connecting TTS...' : 'Start Streaming AI Interview'}
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
              <h2 className="font-bold mb-4 text-center">🎵 Streaming Interview Session</h2>
              
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
              <div className="flex-1 overflow-y-auto space-y-3 mb-4" id="conversation-container">
                {conversationHistory.length === 0 && !isConnected && (
                  <div className="text-center text-gray-500 text-sm mt-8">
                    🎙️ Click "Start Streaming AI Interview" to begin real-time voice conversation with TTS
                  </div>
                )}
                
                {conversationHistory.map((message, index) => (
                  <div key={index} className={`p-3 rounded-lg ${
                    message.role === 'user' 
                      ? 'bg-blue-50 border-l-4 border-blue-400 ml-4' 
                      : 'bg-green-50 border-l-4 border-green-400 mr-4'
                  }`}>
                    <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      {message.role === 'user' ? '👤 You:' : '🤖 AI Interviewer:'}
                      {message.role === 'assistant' && (
                        <span className="text-green-600">🔊</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">{message.content}</div>
                  </div>
                ))}
              </div>

              {/* Live Status */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
                  <span className="flex items-center gap-1">
                    {isConnected ? '🟢 Streaming TTS' : '🔴 Offline'} 
                    {isAiProcessing && <span className="text-blue-600">🎵 Playing</span>}
                  </span>
                  <span>Messages: {conversationHistory.length}</span>
                </div>
                
                {isConnected && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
                    <div className="bg-gradient-to-r from-green-500 to-blue-500 h-1 rounded-full transition-all duration-150 animate-pulse" 
                         style={{width: isAiProcessing ? '100%' : '70%'}}></div>
                  </div>
                )}
                
                <div className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                  {!isConnected && !isConnecting && (
                    <span className="text-gray-400">Ready for streaming TTS interview...</span>
                  )}
                  {isConnecting && (
                    <span className="text-yellow-600">🔌 Connecting to streaming TTS...</span>
                  )}
                  {isConnected && !isAiProcessing && (
                    <span className="text-green-600">🎤 Listening... Speak to hear AI response!</span>
                  )}
                  {isConnected && isAiProcessing && (
                    <span className="text-blue-600">🎵 AI responding with streaming audio...</span>
                  )}
                </div>
              </div>
            </div>
            
            <div className='mt-4 text-gray-600 text-sm'>
              <p className="mb-2">
                🎵 <strong>Streaming TTS Interview:</strong> Real-time voice conversation with instant audio responses
              </p>
              <p className="text-xs">
                Powered by Deepgram Nova-3 transcription + Aura-2 streaming TTS
              </p>
            </div>
        </div>
       </div>
   </div>
  )
}

export default InterviewPage