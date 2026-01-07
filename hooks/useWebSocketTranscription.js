'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

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

  // ✅ NEW: mode switch
  const ttsModeRef = useRef((process.env.NEXT_PUBLIC_TTS_MODE || 'ws').toLowerCase())

  useEffect(() => {
    console.log('[TTS] mode=', ttsModeRef.current)
  }, [])

  // Speech accumulation
  const speechTimeoutRef = useRef(null)
  const accumulatedTranscriptRef = useRef('')
  const lastProcessedTranscriptRef = useRef('')
  const lastSpeechTimeRef = useRef(Date.now())

  // ✅ function refs (TDZ / stale closures)
  const handleSpeechCompleteRef = useRef(() => {})
  const startSpeechRecognitionRef = useRef(() => {})

  // ✅ helpers must exist BEFORE initializeTTSConnection uses them
  const sanitizeForTTS = (text = '') => {
    let t = String(text || '')

    // Remove fenced code blocks + inline code
    t = t.replace(/```[\s\S]*?```/g, ' ')
    t = t.replace(/`([^`]+)`/g, '$1')

    // Remove markdown images/links but keep visible text
    t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Strip emphasis/formatting markers so TTS doesn't say "star star"
    // **bold** or __bold__
    t = t.replace(/(\*\*|__)(.*?)\1/g, '$2')
    // *italic* or _italic_
    t = t.replace(/(\*|_)(.*?)\1/g, '$2')
    // ~~strike~~
    t = t.replace(/~~(.*?)~~/g, '$1')

    // Remove common markdown line prefixes (headings, quotes, list bullets)
    t = t.replace(/^\s{0,3}#{1,6}\s+/gm, '')     // headings
    t = t.replace(/^\s{0,3}>\s+/gm, '')          // blockquotes
    t = t.replace(/^\s*([-*+])\s+/gm, '')        // bullets
    t = t.replace(/^\s*\d+\.\s+/gm, '')          // numbered lists

    // Strip simple HTML tags if any
    t = t.replace(/<\/?[^>]+>/g, ' ')

    // Remove any leftover standalone markdown control chars
    t = t.replace(/[*_#>`]/g, ' ')

    // Normalize whitespace
    t = t.replace(/\s+/g, ' ').trim()
    return t
  }

  const splitForTTS = (text = '', maxLen = 280) => {
    const t = String(text).trim()
    if (!t) return []
    if (t.length <= maxLen) return [t]

    const sentences = t.split(/(?<=[.!?])\s+/)
    const out = []
    let cur = ''

    for (const s of sentences) {
      const next = cur ? `${cur} ${s}` : s
      if (next.length <= maxLen) {
        cur = next
        continue
      }
      if (cur) out.push(cur)
      // if single sentence is too big, hard-split by words
      if (s.length > maxLen) {
        const words = s.split(/\s+/)
        let chunk = ''
        for (const w of words) {
          const cand = chunk ? `${chunk} ${w}` : w
          if (cand.length <= maxLen) chunk = cand
          else {
            if (chunk) out.push(chunk)
            chunk = w
          }
        }
        cur = chunk
      } else {
        cur = s
      }
    }

    if (cur) out.push(cur)
    return out
  }

  const playAudioBlob = useCallback((blob) => {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)

        const cleanup = () => {
          try { URL.revokeObjectURL(url) } catch {}
        }

        audio.onended = () => {
          cleanup()
          resolve(true)
        }
        audio.onerror = () => {
          cleanup()
          resolve(false)
        }

        audio.play().catch(() => {
          cleanup()
          resolve(false)
        })
      } catch {
        resolve(false)
      }
    })
  }, [])

  const startSpeechRecognition = useCallback(() => {
    try {
      const stream = micStreamRef.current
      const room = latestDiscussionRef.current
      if (!stream || !room) return

      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        console.log('ASR already running, skip start')
        return
      }

      const myId = ++asrConnIdRef.current
      const wsUrl =
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1500&vad_events=true&punctuate=true`
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

        // ✅ auto-reconnect guarded + ref call
        if (!disconnectingRef.current && micStreamRef.current) {
          setTimeout(() => {
            console.log('Reconnecting ASR…')
            startSpeechRecognitionRef.current?.()
          }, 400)
        }
      }
    } catch (e) {
      console.error('Failed to start speech recognition:', e)
      setError('Failed to start recognition: ' + (e?.message || 'Unknown error'))
      setIsConnecting(false)
    }
  }, [])

  // keep ref updated
  startSpeechRecognitionRef.current = startSpeechRecognition

  const playAudioChunks = useCallback(async () => {
    try {
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
      audioChunksRef.current = [audioChunksRef.current[0]]
    } catch (e) {
      console.error('Error playing TTS audio:', e)
      setIsAiProcessing(false)
    }
  }, [])

  // ---- TTS WebSocket (ws mode) ----
  const initializeTTSConnection = useCallback(() => {
    try {
      const myTtsId = ++ttsConnIdRef.current

      const ttsUrl = `wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=48000`
      ttsWsRef.current = new WebSocket(ttsUrl, ['token', process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY])

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

            // ✅ Start ASR after TTS is ready (first time only)
            if (startWithAI && !startedOnceRef.current) {
              startedOnceRef.current = true
              startSpeechRecognitionRef.current?.()
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
  }, [playAudioChunks, startWithAI])

  // Send text to TTS (ws OR http)
  const sendTextToTTS = useCallback(async (text) => {
    const clean = sanitizeForTTS(text)
    const mode = ttsModeRef.current

    if (mode === 'http') {
      try {
        const parts = splitForTTS(clean, 280)

        for (const part of parts) {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: part }),
          })

          if (!res.ok) {
            let detail = ''
            try {
              const j = await res.json()
              detail = j?.error || ''
            } catch {}
            throw new Error(detail || `TTS HTTP failed (${res.status})`)
          }

          const blob = await res.blob()
          const ok = await playAudioBlob(blob)
          if (!ok) throw new Error('Audio playback failed')
        }

        setAiTtsReady(true)
      } catch (e) {
        console.warn('HTTP TTS failed:', e?.message || e)
      } finally {
        setIsAiProcessing(false)
        if (startWithAI && !startedOnceRef.current) {
          startedOnceRef.current = true
          startSpeechRecognitionRef.current?.()
        }
      }
      return
    }

    // --- ws mode (existing) ---
    if (!ttsWsRef.current || ttsWsRef.current.readyState !== WebSocket.OPEN) {
      pendingTtsTextRef.current = clean

      if (!ttsWsRef.current || ttsWsRef.current.readyState === WebSocket.CLOSED) {
        initializeTTSConnection()
      }

      if (ttsFlushTimeoutRef.current) clearTimeout(ttsFlushTimeoutRef.current)
      ttsFlushTimeoutRef.current = setTimeout(() => {
        console.warn('TTS: flush timeout — continuing.')
        setIsAiProcessing(false)
        if (startWithAI && !startedOnceRef.current) {
          startedOnceRef.current = true
          startSpeechRecognitionRef.current?.()
        }
      }, 10000)

      return
    }

    ttsWsRef.current.send(JSON.stringify({ type: 'Speak', text: clean }))
    ttsWsRef.current.send(JSON.stringify({ type: 'Flush' }))

    if (ttsFlushTimeoutRef.current) clearTimeout(ttsFlushTimeoutRef.current)
    ttsFlushTimeoutRef.current = setTimeout(() => {
      console.warn('TTS: flush timeout — continuing.')
      setIsAiProcessing(false)
      if (startWithAI && !startedOnceRef.current) {
        startedOnceRef.current = true
        startSpeechRecognitionRef.current?.()
      }
    }, 10000)
  }, [initializeTTSConnection, playAudioBlob, startWithAI])

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

      // ✅ ws/http handled inside
      await sendTextToTTS(aiMessage)
    } catch (e) {
      console.error('Error generating AI intro:', e)
      const fallback = 'Hello! Let’s get started. Please introduce yourself briefly.'
      setAiResponse(fallback)
      setConversationHistory(prev => [...prev, { role: 'assistant', content: fallback }])
      await sendTextToTTS(fallback)
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

      await sendTextToTTS(aiMessage)

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

  handleSpeechCompleteRef.current = handleSpeechComplete

  const cleanupConnections = useCallback(() => {
    disconnectingRef.current = true

    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

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

  const connect = useCallback(async (room) => {
    try {
      cleanupConnections()

      setIsConnecting(true)
      setError(null)

      latestDiscussionRef.current = room
      startedOnceRef.current = false
      asrConnIdRef.current = 0

      if (ttsModeRef.current !== 'http') {
        initializeTTSConnection()
      } else {
        setAiTtsReady(true)
      }

      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (startWithAI) {
        await generateAIIntro(room)
      } else {
        startSpeechRecognitionRef.current?.()
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      setError('Failed to connect: ' + (error?.message || 'Unknown error'))
      setIsConnecting(false)
    }
  }, [cleanupConnections, initializeTTSConnection, startWithAI, generateAIIntro])

  const disconnect = useCallback(() => {
    disconnectingRef.current = true
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

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