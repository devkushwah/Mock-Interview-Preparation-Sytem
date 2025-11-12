'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback, useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebaseConfig'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { Button } from "@/components/ui/button"
import { useWebSocketTranscription } from '@/hooks/useWebSocketTranscription'
import { completeDiscussion, generateAndSaveFullFeedback } from '@/services/firebase/discussionService'
import { Mic, MicOff, Pause, Volume2, WifiOff } from 'lucide-react'

const InterviewEndDialog = dynamic(() => import('../../_components/InterviewEndDialog'), { ssr: false })

const FLUSH_INTERVAL_MS = 500

const InterviewPage = () => {
  const { id } = useParams()
  const router = useRouter()
  const { userData } = useContext(UserContext)

  const [discussionRoomData, setDiscussionRoomData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [isEndingInterview, setIsEndingInterview] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isOffline, setIsOffline] = useState(false)

  const [uiMessages, setUiMessages] = useState([])
  const messagesRef = useRef([])
  const flushTimerRef = useRef(null)
  const lastFlushAtRef = useRef(Date.now())
  const timerIntervalRef = useRef(null)

  const interviewContext = useMemo(() => {
    if (!discussionRoomData) return null
    const { topic, difficulty, practiceOption, interviewerName } = discussionRoomData
    return { topic, difficulty, practiceOption, interviewerName }
  }, [discussionRoomData])

  const handleTranscriptReady = useCallback(() => {}, [])

  const {
    aiResponse,
    isAiProcessing,
    conversationHistory,
    isConnected,
    isConnecting,
    error: transcriptionError,
    connect,
    disconnect,
    clearTranscript,
    hasStartedInterview,   // added
    aiTtsReady             // added (if you want to show any UI hint)
  } = useWebSocketTranscription(
    interviewContext,
    discussionRoomData,
    handleTranscriptReady,
    { startWithAI: true }
  )

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Back online')
      setIsOffline(false)
    }
    const handleOffline = () => {
      console.log('📡 Gone offline')
      setIsOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    setIsOffline(!navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Timer for elapsed time
  useEffect(() => {
    if (hasStartedInterview) {
      const startTime = Date.now()
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
      }, 1000)
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      setElapsedTime(0)
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [hasStartedInterview])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Load discussion room with error handling
  useEffect(() => {
    if (!id) {
      setLoading(false)
      return
    }

    setLoading(true)
    const docRef = doc(db, 'discussionRooms', id)
    
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setDiscussionRoomData({ id: snap.id, ...snap.data() })
          setError(null)
        } else {
          setError('Discussion room not found')
        }
        setLoading(false)
      },
      (err) => {
        console.error('Firebase snapshot error:', err)
        
        if (err.code === 'unavailable' || err.message?.includes('offline')) {
          setError('You appear to be offline. Please check your internet connection.')
          setIsOffline(true)
        } else {
          setError('Failed to load interview room')
        }
        setLoading(false)
      }
    )

    return () => unsub()
  }, [id])

  const flushMessagesToUI = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    setUiMessages(prev => {
      const newArr = messagesRef.current.slice()
      if (prev.length === newArr.length) return prev
      return newArr
    })
    lastFlushAtRef.current = Date.now()
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

  useEffect(() => {
    const iv = setInterval(() => {
      const since = Date.now() - lastFlushAtRef.current
      if (since > FLUSH_INTERVAL_MS) flushMessagesToUI()
    }, FLUSH_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [flushMessagesToUI])

  useEffect(() => {
    if (!conversationHistory) return
    messagesRef.current = conversationHistory.slice()
    scheduleFlush()
  }, [conversationHistory, scheduleFlush])

  useEffect(() => {
    if (aiResponse && !isAiProcessing) {
      flushMessagesToUI()
    }
  }, [aiResponse, isAiProcessing, flushMessagesToUI])

  const hasCredits = (userData?.credit ?? 0) >= 500

  const handleConnect = useCallback(async () => {
    if (!discussionRoomData) return
    
    if (isOffline || !navigator.onLine) {
      alert('You appear to be offline. Please check your internet connection and try again.')
      return
    }

    try {
      const { getUserCredits } = await import('@/services/firebase/userService')
      const credits = await getUserCredits(discussionRoomData.userId)
      if (credits < 500) {
        alert('Insufficient credits. You need at least 500 credits to start an interview.')
        return
      }
    } catch (e) {
      console.error('Credit check failed:', e)
      if (e.code === 'unavailable' || e.message?.includes('offline')) {
        alert('Cannot verify credits - you appear to be offline. Please check your connection.')
        return
      }
      alert('Failed to check credits. Please try again.')
      return
    }
    
    await connect(discussionRoomData)
    // No initialMessage; AI intro will be generated by the hook
  }, [connect, discussionRoomData, isOffline])

  const handleEndInterview = useCallback(async () => {
    if (!id) return
    setIsEndingInterview(true)
    
    try {
      await disconnect()

      const feedbackResult = await generateAndSaveFullFeedback(
        id,
        interviewContext?.practiceOption,
        interviewContext?.topic,
        discussionRoomData?.userId
      )

      if (!feedbackResult?.success) {
        console.error('Feedback generation failed:', feedbackResult?.error)
        await completeDiscussion(id, { feedback: null, userId: discussionRoomData?.userId })
      } else {
        await completeDiscussion(id, { feedback: feedbackResult.feedback || null, userId: discussionRoomData?.userId })
      }

      if (conversationHistory && conversationHistory.length > 0) {
        await updateDoc(doc(db, 'discussionRooms', id), { conversation: conversationHistory })
      }

      setShowEndDialog(true)
    } catch (err) {
      console.error('Error ending interview:', err)
      
      if (err.code === 'unavailable' || err.message?.includes('offline')) {
        alert('Some data may not have been saved due to connection issues. Your conversation history has been preserved locally.')
      }
      
      setShowEndDialog(true)
    } finally {
      setIsEndingInterview(false)
    }
  }, [disconnect, id, interviewContext, conversationHistory, discussionRoomData])

  const handleCloseDialog = useCallback(() => {
    setShowEndDialog(false)
    router.replace('/dashboard')
  }, [router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="text-sm text-slate-600">Loading interview...</p>
        </div>
      </div>
    )
  }

  if (error || transcriptionError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md">
          {isOffline && (
            <div className="mb-4 flex justify-center">
              <WifiOff className="h-12 w-12 text-red-500" />
            </div>
          )}
          <p className="text-red-500 mb-4">{error || transcriptionError}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => router.back()} variant="outline">Go Back</Button>
            {isOffline && (
              <Button onClick={() => window.location.reload()} variant="default">
                Retry Connection
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Offline Banner */}
      {isOffline && (
        <div className="sticky top-0 z-20 bg-red-500 text-white px-4 py-2 text-center text-sm flex items-center justify-center gap-2">
          <WifiOff className="h-4 w-4" />
          <span>You are offline. Some features may not work.</span>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 md:px-6 md:py-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xs font-semibold text-slate-900 md:text-base truncate">
              {discussionRoomData?.topic || 'Technical Interview'} - {discussionRoomData?.practiceOption || 'Interview'}
            </h1>
            <div className="flex items-center gap-2 md:gap-3 mt-1 text-[10px] md:text-xs text-slate-600">
              <span className={`flex items-center gap-1 ${hasStartedInterview ? 'text-red-500' : 'text-slate-500'}`}>
                <span className={`h-1.5 w-1.5 md:h-2 md:w-2 rounded-full ${hasStartedInterview ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {hasStartedInterview ? 'Recording' : 'Waiting'}
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="font-mono">{formatTime(elapsedTime)}</span>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEndInterview}
            disabled={!hasStartedInterview || isEndingInterview}
            className="ml-2 text-xs md:text-sm px-2 md:px-3 h-8 md:h-9 flex-shrink-0"
          >
            <MicOff className="mr-0 md:mr-1 h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden sm:inline">End</span>
          </Button>
        </div>
      </div>

      {/* Conversation Area */}
      <div
        id="conversation-container"
        className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6"
      >
        {uiMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center max-w-md px-4">
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-blue-100 p-3 md:p-4">
                  <Mic className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
                </div>
              </div>
              <p className="text-sm md:text-base text-slate-600 mb-4 md:mb-6">
                Ready to start your mock interview? Click the button below to begin.
              </p>
              <Button
                onClick={handleConnect}
                disabled={isConnecting || !discussionRoomData || !hasCredits || isOffline}
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              >
                {isConnecting ? 'Connecting...' : isOffline ? 'Offline' : hasCredits ? 'Start Interview' : 'Insufficient Credits'}
              </Button>
              {!hasCredits && (
                <p className="mt-3 text-xs text-red-500">You need at least 500 credits to start</p>
              )}
              {isOffline && (
                <p className="mt-3 text-xs text-red-500">Please check your internet connection</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-4xl space-y-3 md:space-y-4">
            {uiMessages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-2 md:gap-3 max-w-[90%] sm:max-w-[85%] md:max-w-[75%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="flex-shrink-0">
                    <div className={`h-7 w-7 md:h-10 md:w-10 rounded-full flex items-center justify-center text-white font-semibold text-xs md:text-sm ${
                      message.role === 'user' ? 'bg-blue-600' : 'bg-slate-700'
                    }`}>
                      {message.role === 'user' ? 'Y' : 'AI'}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex items-center gap-1.5 md:gap-2">
                      <span className={`text-[9px] md:text-xs font-semibold uppercase tracking-wide ${
                        message.role === 'user' ? 'text-blue-600' : 'text-slate-700'
                      }`}>
                        {message.role === 'user' ? 'Candidate' : 'Interviewer'}
                      </span>
                      <span className="text-[9px] md:text-[10px] text-slate-400">10:0{idx}</span>
                    </div>
                    <div
                      className={`rounded-2xl px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm leading-relaxed shadow-sm ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-sm'
                          : 'bg-white text-slate-700 border border-slate-200 rounded-tl-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {isAiProcessing && (
              <div className="flex justify-start">
                <div className="flex gap-2 md:gap-3 max-w-[90%] sm:max-w-[85%] md:max-w-[75%]">
                  <div className="flex-shrink-0">
                    <div className="h-7 w-7 md:h-10 md:w-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold text-xs md:text-sm">
                      AI
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1">
                      <span className="text-[9px] md:text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Interviewer
                      </span>
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-3 py-2 md:px-4 md:py-3 shadow-sm">
                      <div className="flex items-center gap-1">
                        <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      {hasStartedInterview && (
        <div className="sticky bottom-0 border-t bg-white/95 backdrop-blur-sm shadow-lg">
          <div className="mx-auto max-w-4xl px-3 py-3 md:px-6 md:py-4">
            <div className="flex items-center justify-center gap-2 md:gap-4">
              <button className="flex h-12 w-12 md:h-16 md:w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all active:scale-95">
                <Mic className="h-5 w-5 md:h-7 md:w-7" />
              </button>
              <button className="flex h-10 w-10 md:h-14 md:w-14 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-all active:scale-95">
                <Pause className="h-4 w-4 md:h-6 md:w-6" />
              </button>
              <button className="flex h-10 w-10 md:h-14 md:w-14 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-all active:scale-95">
                <Volume2 className="h-4 w-4 md:h-6 md:w-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ending Interview Overlay */}
      {isEndingInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex flex-col items-center gap-4 rounded-xl bg-white p-6 md:p-8 shadow-2xl max-w-sm">
            <div className="h-10 w-10 md:h-12 md:w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-center text-xs md:text-sm text-slate-600">
              Generating your feedback...
              <br />
              <span className="text-[10px] md:text-xs text-slate-500">This may take a moment</span>
            </p>
          </div>
        </div>
      )}

      {/* End Dialog */}
      {showEndDialog && (
        <InterviewEndDialog
          discussionRoomId={id}
          onClose={handleCloseDialog}
        />
      )}
    </div>
  )
}

export default InterviewPage
