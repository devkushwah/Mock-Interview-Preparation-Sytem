'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebaseConfig'
import { doc, onSnapshot } from 'firebase/firestore'
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

const InterviewPage = () => {
  const { id } = useParams()
  const router = useRouter()
  const [discussionRoomData, setDiscussionRoomData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [uiMessages, setUiMessages] = useState([]) // messages used for render (batched updates)
  const messagesRef = useRef([]) // authoritative list (mutates often, no re-renders)
  const flushTimerRef = useRef(null)
  const lastFlushAtRef = useRef(Date.now())

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

  // Hook -- keep using it but avoid re-render spam
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
   */
  useEffect(() => {
    if (!conversationHistory || conversationHistory.length === 0) return

    // Append new items into messagesRef (assume conversationHistory contains incremental messages)
    // To avoid duplications, we append only messages that aren't already present by shallow check of length or timestamps.
    // Simpler: replace messagesRef entirely if length differs significantly (safe fallback).
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
      await connect(discussionRoomData)
    }
  }, [connect, discussionRoomData])

  /**
   * End interview — show dialog immediately and generate feedback in background.
   * This avoids blocking UI while AI runs feedback generation.
   */
  const handleEndInterview = useCallback(async () => {
    try {
      // disconnect WS/TTS first
      await disconnect()

      // show dialog fast
      setShowEndDialog(true)

      // background generation (do not await here to keep UI snappy)
      ;(async () => {
        try {
          const feedbackResult = await generateAndSaveFullFeedback(
            id,
            interviewContext?.practiceOption,
            interviewContext?.topic
          )
          if (!feedbackResult.success) {
            if (feedbackResult.isRateLimit) {
              console.warn('Rate limit hit for feedback generation')
            } else {
              console.error('Feedback generation failed:', feedbackResult.error)
            }
            // fallback: still mark discussion complete without feedback or mark pending
            await completeDiscussion(id, { feedback: null })
            return
          }
          // complete discussion and attach feedback (server will persist)
          await completeDiscussion(id, { feedback: feedbackResult.feedback || null })
        } catch (bgErr) {
          console.error('Background feedback error:', bgErr)
        }
      })()
    } catch (err) {
      console.error('Error ending interview:', err)
    }
  }, [disconnect, id, interviewContext])

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
    <div className='-mt-12'>
      <h2 className='text-lg font-bold'>{discussionRoomData?.practiceOption}</h2>

      <div className='mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10'>
        <div className='lg:col-span-2'>
          <div className='h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col items-center justify-center relative'>
            <img
              loading="lazy"
              src={getInterviewerAvatar(discussionRoomData?.interviewerName)}
              alt={discussionRoomData?.interviewerName || 'Interviewer'}
              className={`h-[80px] w-[80px] rounded-full object-cover transition-all duration-500 ${
                isConnected
                  ? 'animate-pulse border-4 border-green-400 shadow-lg shadow-green-400/50'
                  : isAiProcessing
                    ? 'animate-pulse border-4 border-blue-400'
                    : 'border-2 border-gray-300'
              }`}
            />
            <h2 className="text-gray-800 mb-2">{discussionRoomData?.interviewerName}</h2>

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

            {aiResponse && !isAiProcessing && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md text-center mt-4">
                <div className="text-sm text-green-800 font-medium mb-1">AI Interviewer:</div>
                <div className="text-sm text-gray-700">{aiResponse}</div>
                <div className="text-xs text-green-600 mt-2">✅ Audio played</div>
              </div>
            )}

            {isConnected && (
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                
              </div>
            )}

            {isConnecting && (
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-spin"></div>
                <span className="text-sm text-yellow-600">Connecting</span>
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
              <Button variant="destructive" onClick={handleEndInterview}>
                End Interview
              </Button>
              :
              <Button
                onClick={handleConnect}
                disabled={isConnecting || !discussionRoomData}
                className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg"
              >
                {isConnecting ? 'Connecting' : 'Start Interview'}
              </Button>
            }

            {(transcript || uiMessages.length > 0) && (
              <Button variant="outline" onClick={handleClearSession}>
                Clear Session
              </Button>
            )}
          </div>
        </div>

        <div>
          <div className='h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col relative overflow-hidden'>
            <h2 className="font-bold mb-4 text-center">Streaming Interview Session</h2>

            {/* Current Speech Display */}
            {(transcript || interimTranscript) && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-4 rounded">
                <div className="text-xs font-medium text-blue-600 mb-1">You're saying:</div>
                {transcript && <div className="text-sm text-gray-700 mb-1">{transcript}</div>}
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
              {uiMessages.length === 0 && !isConnected && (
                <div className="text-center text-gray-500 text-sm mt-8">
                  🎙️ Click "Start Interview" to begin real-time voice conversation with AI
                </div>
              )}

              {uiMessages.map((message, index) => (
                <div key={index} className={`p-3 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-50 border-l-4 border-blue-400 ml-4'
                    : 'bg-green-50 border-l-4 border-green-400 mr-4'
                }`}>
                  <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    {message.role === 'user' ? '👤 You:' : '🤖 AI Interviewer:'}
                    {message.role === 'assistant' && <span className="text-green-600">🔊</span>}
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
                <span>Messages: {uiMessages.length}</span>
              </div>

              {isConnected && (
                <div className="w-full bg-gray-200 rounded-full h-1 mb-2">
                  <div className="bg-gradient-to-r from-green-500 to-blue-500 h-1 rounded-full transition-all duration-150 animate-pulse"
                       style={{width: isAiProcessing ? '100%' : '70%'}}></div>
                </div>
              )}

              <div className="text-xs text-gray-600 p-2 bg-gray-50 rounded">
                {!isConnected && !isConnecting && <span className="text-gray-400">Ready for streaming interview...</span>}
                {isConnecting && <span className="text-yellow-600">🔌 Connecting to streaming TTS...</span>}
                {isConnected && !isAiProcessing && <span className="text-green-600">🎤 Listening... Speak to hear AI response!</span>}
                {isConnected && isAiProcessing && <span className="text-blue-600">🎵 AI responding with streaming audio...</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showEndDialog && (
        <InterviewEndDialog
          discussionRoomId={id}
          onClose={() => {
            setShowEndDialog(false)
            router.push('/dashboard')
          }}
        />
      )}
    </div>
  )
}

export default InterviewPage
