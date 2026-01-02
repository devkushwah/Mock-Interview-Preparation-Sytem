'use client'

import { useState, useRef, useCallback } from 'react'

export const useWebSocketTranscription = (interviewContext, discussionRoomData, handleTranscriptReady, options = {}) => {
  const { startWithAI = false } = options

  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [conversationHistory, setConversationHistory] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState(null)

  // Flags
  const [hasStartedInterview, setHasStartedInterview] = useState(false)
  const [aiTtsReady, setAiTtsReady] = useState(false)

  // Refs
  const wsRef = useRef(null)                 // ASR WS
  const ttsWsRef = useRef(null)              // TTS WS
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioChunksRef = useRef([])
  const micStreamRef = useRef(null)
  const latestDiscussionRef = useRef(null)
  const disconnectingRef = useRef(false)
  const startedOnceRef = useRef(false)
  const asrConnIdRef = useRef(0)

  // ✅ NEW: TTS reliability refs
  const pendingTtsTextRef = useRef(null)
  const ttsFlushTimeoutRef = useRef(null)
  const ttsConnIdRef = useRef(0)

  // Speech accumulation
  const speechTimeoutRef = useRef(null)
  const accumulatedTranscriptRef = useRef('')
  const lastProcessedTranscriptRef = useRef('')
  const lastSpeechTimeRef = useRef(Date.now())

  // ✅ add this ref to avoid TDZ
  const handleSpeechCompleteRef = useRef(() => {})

  const startSpeechRecognition = useCallback(() => {
    try {
      const stream = micStreamRef.current
      const room = latestDiscussionRef.current
      if (!stream || !room) return

      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        console.log('ASR already running, skip start')
        return
      }

      const myId = ++asrConnIdRef.current
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1500&vad_events=true&punctuate=true`
      const ws = new WebSocket(wsUrl, ['token', process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY])
      wsRef.current = ws

      ws.onopen = () => {
        if (asrConnIdRef.current !== myId) return
        console.log('Speech recognition WebSocket connected')
        setHasStartedInterview(true)
        setIsConnected(true)
        setIsConnecting(false)

        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(event.data)
        }
        mediaRecorderRef.current.start(100)
      }

      ws.onmessage = (event) => {
        if (asrConnIdRef.current !== myId) return
        const data = JSON.parse(event.data)

        if (data.channel?.alternatives?.[0]) {
          const t = data.channel.alternatives[0].transcript
          if (data.is_final && t.trim()) {
            setTranscript((accumulatedTranscriptRef.current + ' ' + t).trim())
            setInterimTranscript('')
            lastSpeechTimeRef.current = Date.now()
            // ✅ use ref (prevents TDZ error)
            handleSpeechCompleteRef.current(t, room)
          } else if (t) {
            lastSpeechTimeRef.current = Date.now()
            setInterimTranscript(t)
          }
        }
        if (data.type === 'UtteranceEnd') {
          console.log('🔇 Utterance ended - user paused speaking')
        }
      }

      ws.onerror = (e) => {
        if (asrConnIdRef.current !== myId) return
        console.error('Speech recognition WebSocket error:', e)
        setError('Connection error occurred')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        if (asrConnIdRef.current !== myId) return
        console.log('Speech recognition WebSocket closed')
        setIsConnected(false)
        setHasStartedInterview(false)
        setIsConnecting(false)
        if (!disconnectingRef.current && micStreamRef.current) {
          setTimeout(() => {
            console.log('Reconnecting ASR…')
            startSpeechRecognition()
          }, 400)
        }
      }
    } catch (e) {
      console.error('Failed to start speech recognition:', e)
      setError('Failed to start recognition: ' + (e?.message || 'Unknown error'))
      setIsConnecting(false)
    }
  }, []) // ✅ IMPORTANT: do NOT depend on handleSpeechComplete

  // ✅ helpers must exist BEFORE initializeTTSConnection uses them
  const sanitizeForTTS = (text = '') => {
    let t = String(text)
    t = t.replace(/```[\s\S]*?```/g, '')
    t = t.replace(/`([^`]+)`/g, '$1')
    return t.trim()
  }

  const playAudioChunks = useCallback(async () => {
    try {
      // if only header/no audio, don't get stuck
      if (!audioChunksRef.current || audioChunksRef.current.length <= 1) {
        console.warn('TTS: no audio payload received.')
        setIsAiProcessing(false)
        return
      }

      const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0)
      const combined = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of audioChunksRef.current) {
        combined.set(chunk, offset)
        offset += chunk.length
      }

      const audioBlob = new Blob([combined], { type: 'audio/wav' })
      const url = URL.createObjectURL(audioBlob)
      const audio = new Audio(url)

      audio.onended = () => {
        URL.revokeObjectURL(url)
        setIsAiProcessing(false)
      }

      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setIsAiProcessing(false)
      }

      await audio.play()

      // keep only header for next playback
      audioChunksRef.current = [audioChunksRef.current[0]]
    } catch (e) {
      console.error('Error playing TTS audio:', e)
      setIsAiProcessing(false)
    }
  }, [])

  // ---- TTS WebSocket ----
  const initializeTTSConnection = useCallback(() => {
    try {
      const myTtsId = ++ttsConnIdRef.current

      const ttsUrl = `wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=48000`
      ttsWsRef.current = new WebSocket(ttsUrl, ['token', process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY])

      // Minimal WAV header
      const wavHeader = new Uint8Array([
        0x52,0x49,0x46,0x46, 0x00,0x00,0x00,0x00, 0x57,0x41,0x56,0x45,
        0x66,0x6D,0x74,0x20, 0x10,0x00,0x00,0x00, 0x01,0x00, 0x01,0x00,
        0x80,0xBB,0x00,0x00, 0x00,0xEE,0x02,0x00, 0x02,0x00, 0x10,0x00,
        0x64,0x61,0x74,0x61, 0x00,0x00,0x00,0x00
      ])

      ttsWsRef.current.onopen = () => {
        if (ttsConnIdRef.current !== myTtsId) return
        console.log('TTS WebSocket connected')
        audioChunksRef.current = [wavHeader]

        // ✅ If intro/response was generated before socket opened, send it now
        if (pendingTtsTextRef.current) {
          const clean = pendingTtsTextRef.current
          pendingTtsTextRef.current = null
          try {
            ttsWsRef.current.send(JSON.stringify({ type: 'Speak', text: clean }))
            ttsWsRef.current.send(JSON.stringify({ type: 'Flush' }))
          } catch (e) {
            console.error('Failed to send pending TTS text:', e)
          }
        }
      }

      ttsWsRef.current.onmessage = async (event) => {
        if (ttsConnIdRef.current !== myTtsId) return

        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer()
          const audioData = new Uint8Array(arrayBuffer)
          audioChunksRef.current.push(audioData)
          return
        }

        try {
          const data = JSON.parse(event.data)
          if (data.type === 'Flushed') {
            console.log('TTS Flushed - playing audio')

            if (ttsFlushTimeoutRef.current) {
              clearTimeout(ttsFlushTimeoutRef.current)
              ttsFlushTimeoutRef.current = null
            }

            setAiTtsReady(true)
            playAudioChunks()

            if (startWithAI && !startedOnceRef.current) {
              startedOnceRef.current = true
              startSpeechRecognition()
            }
          }
        } catch {
          // non-JSON control messages
        }
      }

      ttsWsRef.current.onerror = (e) => {
        if (ttsConnIdRef.current !== myTtsId) return
        console.error('TTS WebSocket error:', e)
      }

      ttsWsRef.current.onclose = () => {
        if (ttsConnIdRef.current !== myTtsId) return
        console.log('TTS WebSocket closed')
      }
    } catch (e) {
      console.error('Failed to initialize TTS connection:', e)
    }
  }, [playAudioChunks, startWithAI, startSpeechRecognition])

  // Send text to TTS for streaming synthesis (now sanitized)
  const sendTextToTTS = useCallback((text) => {
    const clean = sanitizeForTTS(text)

    // ✅ If socket isn't open yet, queue text so it won't get dropped
    if (!ttsWsRef.current || ttsWsRef.current.readyState !== WebSocket.OPEN) {
      pendingTtsTextRef.current = clean

      // If socket is missing/closed, try to (re)open it
      if (!ttsWsRef.current || ttsWsRef.current.readyState === WebSocket.CLOSED) {
        initializeTTSConnection()
      }

      // Also avoid "AI speaking…" forever if flush never comes
      if (ttsFlushTimeoutRef.current) clearTimeout(ttsFlushTimeoutRef.current)
      ttsFlushTimeoutRef.current = setTimeout(() => {
        console.warn('TTS: flush timeout — continuing.')
        setIsAiProcessing(false)
        if (startWithAI && !startedOnceRef.current) {
          startedOnceRef.current = true
          startSpeechRecognition()
        }
      }, 10000)

      return
    }

    // Normal path
    ttsWsRef.current.send(JSON.stringify({ type: 'Speak', text: clean }))
    ttsWsRef.current.send(JSON.stringify({ type: 'Flush' }))

    if (ttsFlushTimeoutRef.current) clearTimeout(ttsFlushTimeoutRef.current)
    ttsFlushTimeoutRef.current = setTimeout(() => {
      console.warn('TTS: flush timeout — continuing.')
      setIsAiProcessing(false)
      if (startWithAI && !startedOnceRef.current) {
        startedOnceRef.current = true
        startSpeechRecognition()
      }
    }, 10000)
  }, [initializeTTSConnection, startWithAI, startSpeechRecognition])

  // ---- AI messages ----
  const generateAIIntro = useCallback(async (room) => {
    try {
      setIsAiProcessing(true)
      setAiResponse('')

      const introPrompt = [
        `You are an interviewer${room?.interviewerName ? ` named ${room.interviewerName}` : ''}.`,
        room?.topic ? `The interview topic is "${room.topic}".` : null,
        room?.practiceOption ? `Practice mode: ${room.practiceOption}.` : null,
        `Greet the candidate briefly and ask them to introduce themselves to begin.`
      ].filter(Boolean).join(' ')

      const payload = {
        start: true,
        message: introPrompt,
        context: {
          topic: room?.topic,
          practiceOption: room?.practiceOption,
          interviewerName: room?.interviewerName,
        },
        discussionRoomId: room?.id,
        userId: room?.userId
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      let aiMessage = ''
      if (res.ok) {
        const data = await res.json()
        aiMessage = (data.response || '').trim()
      }
      if (!aiMessage) {
        const topic = room?.topic || 'your background'
        aiMessage = `Hello! I’ll be your interviewer today. To begin, please tell me a bit about yourself and your experience related to ${topic}.`
      }

      setAiResponse(aiMessage)
      setConversationHistory(prev => [...prev, { role: 'assistant', content: aiMessage }])

      // ✅ Safe now: will queue if TTS not ready yet
      sendTextToTTS(aiMessage)
    } catch (e) {
      console.error('Error generating AI intro:', e)
      const fallback = 'Hello! Let’s get started. Please introduce yourself briefly.'
      setAiResponse(fallback)
      setConversationHistory(prev => [...prev, { role: 'assistant', content: fallback }])
      sendTextToTTS(fallback)
    }
  }, [sendTextToTTS])

  const generateAIResponse = useCallback(async (completeTranscript, room) => {
    try {
      if (isAiProcessing) return
      if (!completeTranscript || completeTranscript.trim().length < 5) return

      setIsAiProcessing(true)
      setAiResponse('')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: completeTranscript,
          context: {
            topic: room?.topic,
            practiceOption: room?.practiceOption,
            interviewerName: room?.interviewerName,
          },
          discussionRoomId: room?.id,
          userId: room?.userId
        }),
      })

      if (!response.ok) {
        setIsAiProcessing(false)
        return
      }

      const data = await response.json()
      const aiMessage = data.response

      setAiResponse(aiMessage)
      const userMessage = { role: 'user', content: completeTranscript }
      const assistantMessage = { role: 'assistant', content: aiMessage }
      setConversationHistory(prev => [...prev, userMessage, assistantMessage])

      sendTextToTTS(aiMessage)

      accumulatedTranscriptRef.current = ''
      lastProcessedTranscriptRef.current = completeTranscript
    } catch (e) {
      console.error('Error generating AI response:', e)
      setError('Failed to generate response')
      setIsAiProcessing(false)
    }
  }, [sendTextToTTS, isAiProcessing])

  // ---- Speech accumulation ----
  const handleSpeechComplete = useCallback((finalTranscript, room) => {
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

    if (finalTranscript && finalTranscript.trim()) {
      const sep = accumulatedTranscriptRef.current ? ' ' : ''
      accumulatedTranscriptRef.current += sep + finalTranscript.trim()
    }

    lastSpeechTimeRef.current = Date.now()

    speechTimeoutRef.current = setTimeout(() => {
      const since = Date.now() - lastSpeechTimeRef.current
      if (since >= 1500 && accumulatedTranscriptRef.current.trim()) {
        const complete = accumulatedTranscriptRef.current.trim()
        if (complete !== lastProcessedTranscriptRef.current) {
          generateAIResponse(complete, room)
        }
      } else if (since < 1500) {
        handleSpeechComplete('', room)
      }
    }, 1500)
  }, [generateAIResponse])

  // ✅ keep ref updated
  handleSpeechCompleteRef.current = handleSpeechComplete

  const cleanupConnections = useCallback(() => {
    disconnectingRef.current = true

    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

    // ✅ clear TTS pending/timeout
    pendingTtsTextRef.current = null
    if (ttsFlushTimeoutRef.current) {
      clearTimeout(ttsFlushTimeoutRef.current)
      ttsFlushTimeoutRef.current = null
    }

    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }

    if (ttsWsRef.current) {
      try { ttsWsRef.current.send(JSON.stringify({ type: 'Close' })) } catch {}
      try { ttsWsRef.current.close() } catch {}
      ttsWsRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    mediaRecorderRef.current = null

    if (micStreamRef.current) {
      try { micStreamRef.current.getTracks().forEach(t => t.stop()) } catch {}
      micStreamRef.current = null
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }

    // reset flags/state for a clean run
    setIsConnected(false)
    setHasStartedInterview(false)
    setAiTtsReady(false)
    setIsAiProcessing(false)
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setConversationHistory([])
    audioChunksRef.current = []
    accumulatedTranscriptRef.current = ''
    lastProcessedTranscriptRef.current = ''
    lastSpeechTimeRef.current = Date.now()

    // allow reconnect logic again
    setTimeout(() => { disconnectingRef.current = false }, 0)
  }, [])

  const connect = useCallback(async (room) => {
    try {
      // ✅ ensure clean slate (fixes "works once, fails second time")
      cleanupConnections()

      setIsConnecting(true)
      setError(null)

      latestDiscussionRef.current = room
      startedOnceRef.current = false
      asrConnIdRef.current = 0

      initializeTTSConnection()
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (startWithAI) {
        await generateAIIntro(room) // ASR starts after first TTS flush
      } else {
        startSpeechRecognition()
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      setError('Failed to connect: ' + (error?.message || 'Unknown error'))
      setIsConnecting(false)
    }
  }, [cleanupConnections, initializeTTSConnection, startWithAI, generateAIIntro, startSpeechRecognition])

  const disconnect = useCallback(() => {
    disconnectingRef.current = true
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

    // ✅ clear TTS pending/timeout
    pendingTtsTextRef.current = null
    if (ttsFlushTimeoutRef.current) {
      clearTimeout(ttsFlushTimeoutRef.current)
      ttsFlushTimeoutRef.current = null
    }

    if (wsRef.current) { try { wsRef.current.close() } catch {} wsRef.current = null }
    if (ttsWsRef.current) {
      try { ttsWsRef.current.send(JSON.stringify({ type: 'Close' })) } catch {}
      try { ttsWsRef.current.close() } catch {}
      ttsWsRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (micStreamRef.current) {
      try { micStreamRef.current.getTracks().forEach(t => t.stop()) } catch {}
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close() } catch {}
      audioContextRef.current = null
    }

    setIsConnected(false)
    setHasStartedInterview(false)
    setAiTtsReady(false)
    setIsAiProcessing(false)
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setConversationHistory([])
    audioChunksRef.current = []
    accumulatedTranscriptRef.current = ''
    lastProcessedTranscriptRef.current = ''
    lastSpeechTimeRef.current = Date.now()

    setTimeout(() => { disconnectingRef.current = false }, 0)
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setConversationHistory([])
    audioChunksRef.current = []
    accumulatedTranscriptRef.current = ''
    lastProcessedTranscriptRef.current = ''
    lastSpeechTimeRef.current = Date.now()
  }, [])

  return {
    transcript,
    interimTranscript,
    aiResponse,
    isAiProcessing,
    conversationHistory,
    isConnected,
    isConnecting,
    error,
    hasStartedInterview,
    aiTtsReady,
    connect,
    disconnect,
    clearTranscript
  }
}