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
import { Mic, MicOff, Zap, Clock } from 'lucide-react'

const InterviewEndDialog = dynamic(() => import('../../_components/InterviewEndDialog'), { ssr: false })

const InterviewPage = () => {
  const { id } = useParams()
  const router = useRouter()
  const { userData } = useContext(UserContext)
  const [userCredits, setUserCredits] = useState(userData?.credit ?? null)

  const [discussionRoomData, setDiscussionRoomData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showEndDialog, setShowEndDialog] = useState(false)
  const [isEndingInterview, setIsEndingInterview] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isOffline, setIsOffline] = useState(false)

  const timerIntervalRef = useRef(null)

  const interviewContext = useMemo(() => {
    if (!discussionRoomData) return null
    const { topic, difficulty, practiceOption, interviewerName } = discussionRoomData
    return { topic, difficulty, practiceOption, interviewerName }
  }, [discussionRoomData])

  const handleTranscriptReady = useCallback(() => {}, [])

  const {
    isAiProcessing,
    conversationHistory,
    isConnecting,
    error: transcriptionError,
    connect,
    disconnect,
    clearTranscript,
    hasStartedInterview
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

  const hasCredits = (userCredits ?? (userData?.credit ?? 0)) >= 500

  // Keep a current credit count (fetch from server) so UI reflects real-time credits
  useEffect(() => {
    let mounted = true
    if (!userData?.id) return
    ;(async () => {
      try {
        const { getUserCredits } = await import('@/services/firebase/userService')
        const c = await getUserCredits(userData.id)
        if (mounted) setUserCredits(typeof c === 'number' ? c : 0)
      } catch (e) {
        console.warn('Failed to fetch user credits:', e)
        if (mounted && userCredits === null) setUserCredits(userData?.credit ?? 0)
      }
    })()
    return () => { mounted = false }
  }, [userData?.id])

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
          <p className="text-red-500 mb-4">{error || transcriptionError}</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => router.back()} variant="outline">Go Back</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100">
      {/* soft background glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1] overflow-hidden">
        <div className="absolute -top-28 -left-28 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="mx-auto max-w-4xl px-4 md:px-6 py-3">
           <div className="flex items-center justify-between">
             <div className="min-w-0">
               <h1 className="text-base md:text-xl font-semibold tracking-tight text-slate-900">
                 {discussionRoomData?.topic || 'Technical Interview'}
                 <span className="mx-2 text-slate-400">•</span>
                 <span className="text-slate-600">{discussionRoomData?.practiceOption || 'Interview'}</span>
               </h1>
               <div className="mt-1 flex items-center gap-3 text-xs text-slate-600">
                 <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset ${hasStartedInterview ? 'bg-red-50 text-red-600 ring-red-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                   <span className={`h-2 w-2 rounded-full ${hasStartedInterview ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`}></span>
                   {hasStartedInterview ? 'Recording' : 'Waiting'}
                 </span>
                 <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 ring-1 ring-slate-200">
                   <Clock className="h-3 w-3" />
                   <span className="font-mono">{formatTime(elapsedTime)}</span>
                 </span>
                 {!isOffline && <span className="hidden sm:inline-flex items-center gap-1 text-emerald-600"><Zap className="h-3 w-3" />Live</span>}
               </div>
             </div>
 
             <Button
               variant="destructive"
               size="sm"
               onClick={handleEndInterview}
               disabled={!hasStartedInterview || isEndingInterview}
               className="rounded-full shadow-sm"
             >
               <MicOff className="mr-1 h-4 w-4" />
               End
             </Button>
           </div>
         </div>
       </div>
 
       {/* Main */}
       <main className="flex-1">
         {!hasStartedInterview ? (
          // Centered start card
          <section className="mx-auto max-w-4xl px-4 md:px-6 py-10 md:py-14">
            <div className="mx-auto w-full max-w-3xl">
              <div className="relative overflow-hidden rounded-3xl ring-1 ring-slate-200/60 bg-gradient-to-br from-white to-blue-50/60 p-8 md:p-10 shadow-lg">
                   <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-100 blur-3xl"></div>
                   <div className="relative">
                     <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                       <Mic className="h-3.5 w-3.5" /> Voice Interview
                     </div>
                     <h2 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                       Ready to start your mock interview?
                     </h2>
                     <p className="mt-2 text-slate-600">
                       The AI will greet you first and then start recording your answers automatically.
                     </p>
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                       <Button
                         onClick={handleConnect}
                         disabled={isConnecting || !discussionRoomData || !hasCredits || isOffline}
                         size="lg"
                         className="rounded-full bg-blue-600 hover:bg-blue-700 shadow-sm"
                       >
                         {isConnecting ? 'Connecting...' : 'Start Interview'}
                       </Button>
                     </div>
                   </div>
                 </div>
             </div>
           </section>
         ) : (
           // Centered in-progress card
           <section className="mx-auto max-w-4xl px-4 md:px-6 py-10 md:py-14">
             <div className="mx-auto w-full max-w-3xl">
              <div className="rounded-3xl ring-1 ring-slate-200/60 bg-white/95 p-8 md:p-10 shadow-lg">
                   <div className="flex items-center justify-between">
                     <div>
                       <h2 className="text-xl font-semibold text-slate-900">Interview in progress</h2>
                       <p className="mt-1 text-sm text-slate-500">
                         {isAiProcessing ? 'AI is speaking…' : 'Listening for your response'}
                       </p>
                     </div>
                     <div className="flex items-end gap-1 h-8">
                       <span className="w-1.5 rounded bg-blue-500 animate-[pulse_1s_ease-in-out_infinite] h-5"></span>
                       <span className="w-1.5 rounded bg-blue-500 animate-[pulse_1.2s_ease-in-out_infinite] h-7"></span>
                       <span className="w-1.5 rounded bg-blue-500 animate-[pulse_0.9s_ease-in-out_infinite] h-4"></span>
                       <span className="w-1.5 rounded bg-blue-500 animate-[pulse_1.1s_ease-in-out_infinite] h-6"></span>
                     </div>
                   </div>
                  <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-slate-500">
                    <div className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
                       <div className="font-medium text-slate-700">Status</div>
                       <div>{isAiProcessing ? 'Speaking' : 'Listening'}</div>
                     </div>
                    <div className="rounded-lg ring-1 ring-slate-200 p-3 bg-white">
                       <div className="font-medium text-slate-700">Elapsed</div>
                       <div className="font-mono">{formatTime(elapsedTime)}</div>
                     </div>
                   </div>
                 </div>
             </div>
           </section>
         )}
       </main>

      {/* End Dialog */}
      {isEndingInterview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl max-w-sm">
            <div className="h-10 w-10 md:h-12 md:w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            <p className="text-center text-sm text-slate-600">
              Generating your feedback…
              <br />
              <span className="text-xs text-slate-500">This may take a moment</span>
            </p>
          </div>
        </div>
      )}

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
