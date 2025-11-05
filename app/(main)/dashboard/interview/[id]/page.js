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
    return interviewer?.avatar || '/avatars/Avatar.png'
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

  const connectionBadgeClasses = isConnected
    ? 'bg-green-100 text-green-700'
    : isConnecting
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-slate-100 text-slate-500';

  const connectionDotClasses = isConnected
    ? 'bg-green-500'
    : isConnecting
      ? 'bg-yellow-500'
      : 'bg-slate-400';

  const statusMessage = !isConnected && !isConnecting
    ? 'Ready when you are. Tap Start Interview to join the live session.'
    : isConnecting
      ? 'Setting up live audio connection...'
      : isAiProcessing
        ? 'AI is speaking. Review the response and prepare your next answer.'
        : 'Microphone is live. Share your response when you’re ready.';

  const currentModeLabel = isAiProcessing
    ? '🎵 AI responding'
    : isConnected
      ? '🎤 Listening'
      : '🔴 Offline';

  const practiceLabel =
    typeof discussionRoomData?.practiceOption === 'string'
      ? discussionRoomData.practiceOption
      : discussionRoomData?.practiceOption?.label ||
        discussionRoomData?.practiceOption?.name ||
        'Mock Interview';

  const topicLabel = discussionRoomData?.topic || 'Interview Session';
  const hasCredits = (userData?.credit ?? 0) >= 500;

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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
        <header className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">
              {practiceLabel}
            </p>
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              {topicLabel}
            </h1>
            {discussionRoomData?.role && (
              <p className="text-sm text-slate-500">
                Target role:{' '}
                <span className="font-medium text-slate-700">{discussionRoomData.role}</span>
              </p>
            )}
            {discussionRoomData?.experience && (
              <p className="text-sm text-slate-500">
                Experience:{' '}
                <span className="font-medium text-slate-700">{discussionRoomData.experience}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <UserButton />
          </div>
        </header>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
          <section className="order-2 w-full lg:order-1 lg:col-span-2">
            <div className="flex h-[70vh] flex-col rounded-2xl bg-white p-4 shadow-sm sm:h-[68vh] lg:h-[70vh]">
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                <span className={`flex items-center gap-2 rounded-full px-3 py-1 font-medium ${connectionBadgeClasses}`}>
                  <span className={`h-2 w-2 rounded-full ${connectionDotClasses}`}></span>
                  {currentModeLabel}
                </span>
                <span className="font-medium text-slate-400">Messages: {uiMessages.length}</span>
              </div>

              <div
                id="conversation-container"
                className="flex-1 overflow-x-hidden overflow-y-auto rounded-xl bg-slate-50 p-3 sm:p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-300"
              >
                {uiMessages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    Your conversation will appear here once the session begins.
                  </p>
                ) : (
                  uiMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`mb-3 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} last:mb-0`}
                    >
                      <div
                        className={`max-w-[84%] sm:max-w-[78%] rounded-2xl px-3 py-2 text-[12px] sm:text-[13px] leading-snug shadow-sm ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <div
                          className={`mb-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide ${
                            message.role === 'user' ? 'text-white/75' : 'text-slate-500'
                          }`}
                        >
                          {message.role === 'user' ? 'You' : 'AI Interviewer'}
                        </div>
                        <div className="max-h-40 sm:max-h-56 overflow-y-auto whitespace-pre-wrap leading-snug scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-300">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
                {statusMessage}
              </div>
            </div>
          </section>

          <aside className="order-1 w-full lg:order-2">
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                  <img
                    loading="lazy"
                    src={getInterviewerAvatar(discussionRoomData?.interviewerName)}
                    alt={discussionRoomData?.interviewerName || 'Interviewer'}
                    className={`h-16 w-16 rounded-full object-cover transition-all duration-500 ${
                      isConnected
                        ? 'ring-2 ring-green-400'
                        : isConnecting
                          ? 'ring-2 ring-yellow-300'
                          : 'ring-1 ring-slate-200'
                    }`}
                  />
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {discussionRoomData?.interviewerName || 'AI Interviewer'}
                    </p>
                    <p className="text-sm text-slate-500">{practiceLabel}</p>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                  <div className="flex items-start justify-between gap-2">
                    <dt className="font-medium text-slate-700">Difficulty</dt>
                    <dd className="text-right capitalize">{discussionRoomData?.difficulty || 'Balanced'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <dt className="font-medium text-slate-700">Practice Option</dt>
                    <dd className="text-right">{practiceLabel}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <dt className="font-medium text-slate-700">Session ID</dt>
                    <dd className="text-right text-xs text-slate-400">{discussionRoomData?.id || id}</dd>
                  </div>
                </dl>

                {isAiProcessing && (
                  <div className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600">
                    Streaming response in progress...
                  </div>
                )}

                {transcriptionError && (
                  <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                    {transcriptionError}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {isConnected ? (
                    <Button
                      variant="destructive"
                      onClick={handleEndInterview}
                      disabled={isEndingInterview}
                      className="w-full py-3 sm:flex-1"
                    >
                      {isEndingInterview ? 'Ending...' : 'End Interview'}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConnect}
                      disabled={isConnecting || !discussionRoomData || isEndingInterview || !hasCredits}
                      className="w-full bg-blue-600 py-3 text-white hover:bg-blue-700 sm:flex-1"
                    >
                      {isConnecting ? 'Connecting...' : hasCredits ? 'Start Interview' : 'Insufficient Credits'}
                    </Button>
                  )}

                  {(transcript || uiMessages.length > 0) && (
                    <Button
                      variant="outline"
                      onClick={handleClearSession}
                      disabled={isEndingInterview}
                      className="w-full py-3 sm:flex-none sm:px-6"
                    >
                      Clear Session
                    </Button>
                  )}
                </div>

                <p className="mt-3 text-xs text-slate-500">{currentModeLabel}</p>
                {!hasCredits && (
                  <p className="mt-2 text-xs font-medium text-red-500">
                    You need at least 500 credits to start a live interview.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {isEndingInterview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-6 shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-sm text-slate-600">Just wait a few seconds, your feedback is being generated...</p>
          </div>
        </div>
      )}

      {showEndDialog && (
        <InterviewEndDialog
          discussionRoomId={id}
          onClose={() => {
            setShowEndDialog(false)
            router.replace('/dashboard')
          }}
        />
      )}
    </div>
  )
}

export default InterviewPage
