'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback, useContext } from 'react'  // useContext add karo yahan
import { UserContext } from '@/app/_context/UserContext'  // Yeh import add karo
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebaseConfig'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'  // Add this import
import { Interviewer } from '@/services/options'
import { UserButton } from '@stackframe/stack'
import { Button } from "@/components/ui/button"
import { useWebSocketTranscription } from '@/hooks/useWebSocketTranscription'
import { completeDiscussion, generateAndSaveFullFeedback } from '@/services/firebase/discussionService'

// Lazy load the dialog (no SSR)
const InterviewEndDialog = dynamic(() => import('../../_components/InterviewEndDialog'), { ssr: false })

/**
 * Simple debounce utility (leading = false)
 */
const debounce = (fn, wait = 100) => {
  let t = null
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

/**
 * When to flush the messages from ref to state:
 * - on AI assistant reply
 * - every N messages (to keep UI in sync)
 */
const FLUSH_BATCH_SIZE = 6 // tune this: larger => fewer renders but slower UI updates
const FLUSH_INTERVAL_MS = 500 // ensure periodic flush for long streams

// Pre-defined initial message from the interviewer (only 1 message, hardcoded for speed)
const initialMessage = {
  role: 'assistant',
  content: 'Hello! To get started, please tell me a little about yourself. This will help me tailor the interview to your experience.'
}

// Fallback TTS function using browser speech synthesis (for initial message only)
const playTTS = (text) => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1 // Adjust speed if needed
    utterance.pitch = 1 // Adjust pitch if needed
    window.speechSynthesis.speak(utterance)
  } else {
    console.warn('TTS not supported in this browser')
  }
}

const InterviewPage = () => {
  const { id } = useParams()
  const router = useRouter()
  const { userData } = useContext(UserContext);  // Yeh line add karo yahan
  const [discussionRoomData, setDiscussionRoomData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [uiMessages, setUiMessages] = useState([]); // messages used for render (batched updates)
  const messagesRef = useRef([]); // authoritative list (mutates often, no re-renders)
  const flushTimerRef = useRef(null)
  const lastFlushAtRef = useRef(Date.now())
  const [isEndingInterview, setIsEndingInterview] = useState(false)  // Add this state for loading

  // Memoized interviewContext to avoid passing new object every render
  const interviewContext = useMemo(() => {
    if (!discussionRoomData) return null
    const { topic, difficulty, practiceOption, interviewerName } = discussionRoomData
    return { topic, difficulty, practiceOption, interviewerName }
  }, [discussionRoomData])

  // Transcript-ready callback (memoized so hook sees stable ref)
  const handleTranscriptReady = useCallback((transcript) => {
    console.log('📝 Transcript ready:', transcript)
    // do not force UI re-render here; feed into hook's internal state or messagesRef if needed
  }, [])

  // Hook -- removed initialMessage to prevent loop in hook/API
  const {
    transcript,
    interimTranscript,
    aiResponse,
    isAiProcessing,
    conversationHistory, // we'll reconcile this with messagesRef (hook may deliver lots of items)
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
    // Removed: initialMessage -- handled in component only
  )

  /**
   * Firestore: listen to discussion room metadata in realtime using onSnapshot
   * This gives instant local cache + updates
   */
  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const docRef = doc(db, 'discussionRooms', id)
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() }
        setDiscussionRoomData(data)
        setError(null)
      } else {
        setError('Discussion room not found')
      }
      setLoading(false)
    }, (err) => {
      console.error('onSnapshot error:', err)
      setError('Failed to load interview room')
      setLoading(false)
    })

    return () => unsub()
  }, [id])

  /**
   * Sync incoming conversationHistory from hook -> messagesRef
   * The hook may provide many small updates. We keep them in messagesRef and flush to UI in batches.
   * Now includes the initial message if provided by the hook.
   */
  useEffect(() => {
    if (!conversationHistory || conversationHistory.length === 0) return

    // Append new items into messagesRef (assume conversationHistory contains incremental messages)
    // To avoid duplications, we append only messages that aren't already present by shallow check of length or timestamps.
    // Simpler: replace messagesRef entirely if conversationHistory looks authoritative from hook
    try {
      const currentLen = messagesRef.current.length
      // If lengths the same, assume no new messages
      if (conversationHistory.length === currentLen) return

      // Replace if conversationHistory looks authoritative from hook
      messagesRef.current = conversationHistory.slice() // shallow copy

      // Decide whether to flush to UI immediately (if last message is assistant) or batch
      const lastMsg = conversationHistory[conversationHistory.length - 1]
      const shouldImmediateFlush = lastMsg?.role === 'assistant' || (conversationHistory.length - currentLen >= FLUSH_BATCH_SIZE)

      if (shouldImmediateFlush) {
        flushMessagesToUI()
      } else {
        scheduleFlush()
      }
    } catch (e) {
      console.warn('Error reconciling conversationHistory:', e)
      // fallback: set state directly
      messagesRef.current = conversationHistory.slice()
      flushMessagesToUI()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationHistory])

  /**
   * Flush messages from messagesRef to UI state (batched)
   */
  const flushMessagesToUI = useCallback(() => {
    // cancel pending
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    // update UI from ref (immutable copy)
    setUiMessages(prev => {
      // micro-optimization: if identical arrays, skip
      const newArr = messagesRef.current.slice()
      if (prev.length === newArr.length) return prev
      return newArr
    })
    lastFlushAtRef.current = Date.now()

    // smooth auto-scroll if needed
    requestAnimationFrame(() => {
      const c = document.getElementById('conversation-container')
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flushMessagesToUI()
    }, FLUSH_INTERVAL_MS)
  }, [flushMessagesToUI])

  // Periodic flush backup in case streaming never triggers assistant message
  useEffect(() => {
    const interval = setInterval(() => {
      const since = Date.now() - lastFlushAtRef.current
      if (since > FLUSH_INTERVAL_MS) {
        flushMessagesToUI()
      }
    }, FLUSH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [flushMessagesToUI])

  // Derived small helpers
  const getInterviewerAvatar = useCallback((interviewerName) => {
    const interviewer = Interviewer.find(i => i.name === interviewerName)
    return interviewer?.avatar || '/images/avatar-placeholder.svg'
  }, [])

  const handleConnect = useCallback(async () => {
    if (discussionRoomData) {
      // Credit check before starting interview
      try {
        const { getUserCredits } = await import('@/services/firebase/userService');
        const credits = await getUserCredits(discussionRoomData.userId);
        if (credits < 500) { // Minimum credits to start (adjust as needed)
          alert('Insufficient credits. You need at least 500 credits to start an interview.');
          return;
        }
      } catch (error) {
        console.error('Credit check failed:', error);
        alert('Failed to check credits. Please try again.');
        return;
      }
      await connect(discussionRoomData)
      // Add initial message to UI and play TTS immediately after connect
      messagesRef.current = [initialMessage]
      setUiMessages([initialMessage])
      playTTS(initialMessage.content)  // Play initial message via browser TTS
    }
  }, [connect, discussionRoomData])

  /**
   * End interview — show dialog immediately and generate feedback in background.
   * This avoids blocking UI while AI runs feedback generation.
   */
  const handleEndInterview = useCallback(async () => {
    setIsEndingInterview(true)
    try {
      if (isAiProcessing) {
        console.log('Stopping ongoing TTS...')
      }
      await disconnect()
      
      const feedbackResult = await generateAndSaveFullFeedback(
        id,
        interviewContext?.practiceOption,
        interviewContext?.topic,
        discussionRoomData?.userId // Pass userId for credit deduction
      )
      if (!feedbackResult.success) {
        console.error('Feedback generation failed:', feedbackResult.error)
        await completeDiscussion(id, { feedback: null, userId: discussionRoomData?.userId })  // Added userId
      } else {
        await completeDiscussion(id, { feedback: feedbackResult.feedback || null, userId: discussionRoomData?.userId })  // Added userId
      }
      
      // Save conversation to Firestore
      if (conversationHistory && conversationHistory.length > 0) {
        await updateDoc(doc(db, 'discussionRooms', id), { conversation: conversationHistory })
      }
      
      setShowEndDialog(true)
    } catch (err) {
      console.error('Error ending interview:', err)
    } finally {
      setIsEndingInterview(false)
    }
  }, [disconnect, id, interviewContext, isAiProcessing, conversationHistory, discussionRoomData])  // Added discussionRoomData to deps

  // Auto-scroll on aiResponse (but non-blocking)
  useEffect(() => {
    if (aiResponse && !isAiProcessing) {
      // ensure messages UI contains latest
      // flush messages immediately so UI shows AI response
      flushMessagesToUI()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiResponse, isAiProcessing])

  // Clear session handler
  const handleClearSession = useCallback(async () => {
    try {
      clearTranscript()
      messagesRef.current = []
      setUiMessages([])
    } catch (err) {
      console.error('clear session error:', err)
    }
  }, [clearTranscript])

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
    <div className='-mt-12 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen p-4'>
      <div className='max-w-7xl mx-auto'>
        <div className='bg-white rounded-xl shadow-lg p-6 mb-6'>
          <h2 className='text-2xl font-bold text-gray-800 flex items-center gap-2'>
            <span className='text-blue-600'>🎤</span>
            {discussionRoomData?.practiceOption}
          </h2>
          <p className='text-gray-600 mt-1'>Topic: {discussionRoomData?.topic} | Difficulty: {discussionRoomData?.difficulty}</p>
          <p className='text-gray-600 mt-1'>Total Credits: {userData?.credit || 0}</p> {/* Display credits */}
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-8'>
          <div className='lg:col-span-1'>  {/* Changed from lg:col-span-2 to lg:col-span-1 to shrink left panel */}
            <div className='h-[65vh] bg-white border-2 border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center relative shadow-xl'>
              <div className='absolute top-4 right-4'>
                <UserButton />
              </div>
              <img
                loading="lazy"
                src={getInterviewerAvatar(discussionRoomData?.interviewerName)}
                alt={discussionRoomData?.interviewerName || 'Interviewer'}
                className={`h-20 w-20 rounded-full object-cover transition-all duration-500 ${
                  isConnected
                    ? 'animate-pulse border-4 border-green-400 shadow-lg shadow-green-400/50'
                    : isAiProcessing
                      ? 'animate-pulse border-4 border-blue-400 shadow-lg shadow-blue-400/50'
                      : 'border-2 border-gray-300'
                }`}
              />
              <h2 className="text-xl font-semibold text-gray-800 mb-2">{discussionRoomData?.interviewerName}</h2>

              {isAiProcessing && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-5 max-w-md text-center mt-6 shadow-md">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                  <div className="text-sm text-blue-700 font-medium">Streaming Response...</div>
                  
                </div>
              )}

              {isConnected && (
                <div className="absolute top-6 left-6 flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-700 font-medium">Live Streaming</span>
                </div>
              )}

              {isConnecting && (
                <div className="absolute top-6 left-6 flex items-center gap-2 bg-yellow-100 px-3 py-1 rounded-full">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full animate-spin"></div>
                  <span className="text-sm text-yellow-700 font-medium">Connecting...</span>
                </div>
              )}

              {transcriptionError && (
                <div className="absolute top-6 right-6 bg-red-50 border border-red-200 rounded-lg p-3 max-w-xs shadow-md">
                  <div className="text-xs text-red-600">{transcriptionError}</div>
                </div>
              )}
            </div>

            {/* Removed button container from here */}
          </div>

          <div className='lg:col-span-2'>  {/* Changed from implicit 1 to lg:col-span-2 to expand right panel */}
            <div className='h-[65vh] bg-white border-2 border-gray-200 rounded-2xl p-6 flex flex-col relative overflow-hidden shadow-xl'>
            

              {/* Conversation History */}
              <div className="flex-1 overflow-y-auto space-y-2 mb-4" id="conversation-container">  {/* Reduced space-y from 3 to 2 */}
                {uiMessages.map((message, index) => (
                  <div key={index} className={`p-3 rounded-lg shadow-sm min-h-[2rem] ${  // Reduced p from 4 to 3, added min-h for consistent height
                    message.role === 'user'
                      ? 'bg-blue-50 border-l-4 border-blue-400 ml-4'
                      : 'bg-green-50 border-l-4 border-green-400 mr-4'
                  }`}>
                    <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">  {/* Reduced text from sm to xs */}
                      {message.role === 'user' ? '👤 You:' : '🤖 AI Interviewer:'}
                      {message.role === 'assistant' && <span className="text-green-600">🔊</span>}
                    </div>
                    <div className="text-xs text-gray-700">{message.content}</div>  {/* Reduced text from sm to xs */}
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
                  <span>Messages: {uiMessages.length}</span>
                </div>

                {isConnected && (
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-150 animate-pulse"
                         style={{width: isAiProcessing ? '100%' : '70%'}}></div>
                  </div>
                )}

                <div className="text-xs text-gray-600 p-3 bg-gray-50 rounded-lg">
                  {!isConnected && !isConnecting && <span className="text-gray-400">Ready for streaming interview...</span>}
                  {isConnecting && <span className="text-yellow-600">🔌 Connecting to streaming TTS...</span>}
                  {isConnected && !isAiProcessing && <span className="text-green-600">🎤 Listening... Speak to hear AI response!</span>}
                  {isConnected && isAiProcessing && <span className="text-blue-600">🎵 AI responding with streaming audio...</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Moved button container here, below the grid, centered across full width */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {isConnected ? (
            <Button variant="destructive" onClick={handleEndInterview} disabled={isEndingInterview} className="px-6 py-3 text-lg">
              End Interview
            </Button>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={isConnecting || !discussionRoomData || isEndingInterview || (userData?.credit < 500)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 text-lg shadow-lg"
            >
              {isConnecting ? 'Connecting...' : (userData?.credit < 500 ? 'Insufficient Credits' : 'Start Interview')}
            </Button>
          )}

          {(transcript || uiMessages.length > 0) && (
            <Button variant="outline" onClick={handleClearSession} disabled={isEndingInterview} className="px-6 py-3">
              Clear Session
            </Button>
          )}
        </div>
      </div>

      {isEndingInterview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-2 bg-white p-6 rounded-lg shadow-lg">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-600">Just wait a few seconds, your feedback is being generated...</p>
          </div>
        </div>
      )}

      {showEndDialog && (
        <InterviewEndDialog
          discussionRoomId={id}
          onClose={() => {
            setShowEndDialog(false)
            router.replace('/dashboard')  // Immediate navigation without delay
          }}
        />
      )}
    </div>
  )
}

export default InterviewPage
