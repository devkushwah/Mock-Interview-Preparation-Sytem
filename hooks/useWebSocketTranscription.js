'use client'

import { useState, useRef, useCallback } from 'react'

export const useWebSocketTranscription = (interviewContext, discussionRoomData, handleTranscriptReady, options = {}) => {
  const { startWithAI = false } = options

  // ✅ TTS tuning (DECLARE ONCE)  <-- IMPORTANT: remove any duplicate declarations below
  const TTS_IDLE_MS = 12000
  const TTS_HARD_TIMEOUT_MS = 45000

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
  const ttsStatsRef = useRef({ chunks: 0, bytes: 0, lastAudioAt: 0, lastControlAt: 0 })
  const ttsFormatRef = useRef({ sampleRate: 48000, channels: 1, bitsPerSample: 16 })

  // ✅ track TTS playback so ASR doesn’t process while AI is speaking
  const isTtsPlayingRef = useRef(false)

  // ✅ allow stopping currently playing audio on cleanup
  const ttsAudioElRef = useRef(null)
  const ttsAudioUrlRef = useRef(null)

  const stopTtsPlayback = () => {
    try {
      isTtsPlayingRef.current = false
      if (ttsAudioElRef.current) {
        ttsAudioElRef.current.pause()
        ttsAudioElRef.current.src = ''
        ttsAudioElRef.current = null
      }
      if (ttsAudioUrlRef.current) {
        URL.revokeObjectURL(ttsAudioUrlRef.current)
        ttsAudioUrlRef.current = null
      }
    } catch {}
  }

  // ✅ utterance lifecycle + timers
  const ttsUtteranceIdRef = useRef(0)
  const ttsIdleTimerRef = useRef(null)
  const ttsHardTimerRef = useRef(null)
  const ttsIsFinalizingRef = useRef(false)
  const ttsHasAudioRef = useRef(false)
  const ttsUtteranceStartedAtRef = useRef(0)

  const micStreamRef = useRef(null)
  const latestDiscussionRef = useRef(null)
  const disconnectingRef = useRef(false)
  const startedOnceRef = useRef(false)
  const asrConnIdRef = useRef(0)

  // TTS reliability refs
  const pendingTtsTextRef = useRef(null)
  const ttsFlushTimeoutRef = useRef(null)
  const ttsConnIdRef = useRef(0)

  // Speech accumulation
  const speechTimeoutRef = useRef(null)
  const accumulatedTranscriptRef = useRef('')
  const lastProcessedTranscriptRef = useRef('')
  const lastSpeechTimeRef = useRef(Date.now())

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

        // ✅ ignore ASR events while AI TTS audio is playing
        if (isTtsPlayingRef.current) return

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
        if (data.type === 'UtteranceEnd') console.log('🔇 Utterance ended - user paused speaking')
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
  }, [])

  const sanitizeForTTS = (text = '') => {
    let t = String(text)
    t = t.replace(/```[\s\S]*?```/g, '')
    t = t.replace(/`([^`]+)`/g, '$1')
    return t.trim()
  }

  const base64ToUint8Array = (base64 = '') => {
    try {
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return bytes
    } catch {
      console.warn('TTS: failed to decode base64 audio chunk')
      return null
    }
  }

  const createWavHeader = ({ sampleRate, channels, bitsPerSample }, dataBytes) => {
    const blockAlign = channels * (bitsPerSample / 8)
    const byteRate = sampleRate * blockAlign
    const buffer = new ArrayBuffer(44)
    const view = new DataView(buffer)
    const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }

    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + dataBytes, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeStr(36, 'data')
    view.setUint32(40, dataBytes, true)
    return new Uint8Array(buffer)
  }

  const ttsStartAsrTimerRef = useRef(null)
  const ttsActiveUtteranceIdRef = useRef(0)

  const clearTtsTimers = () => {
    if (ttsIdleTimerRef.current) { clearTimeout(ttsIdleTimerRef.current); ttsIdleTimerRef.current = null }
    if (ttsHardTimerRef.current) { clearTimeout(ttsHardTimerRef.current); ttsHardTimerRef.current = null }
    if (ttsStartAsrTimerRef.current) { clearTimeout(ttsStartAsrTimerRef.current); ttsStartAsrTimerRef.current = null }
  }

  const ttsAudioMimeRef = useRef('audio/wav')

  const playAudioFromChunks = useCallback(async (chunksSnapshot, onEnded) => {
    try {
      if (!chunksSnapshot || chunksSnapshot.length === 0) {
        console.warn('TTS: no audio payload received.')
        setIsAiProcessing(false)
        if (typeof onEnded === 'function') onEnded()
        return
      }

      // stop any previous playback
      stopTtsPlayback()

      const totalLength = chunksSnapshot.reduce((acc, c) => acc + c.length, 0)
      const combined = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunksSnapshot) {
        combined.set(chunk, offset)
        offset += chunk.length
      }

      const looksLikeWav =
        combined.length >= 12 &&
        combined[0] === 0x52 && combined[1] === 0x49 && combined[2] === 0x46 && combined[3] === 0x46 &&
        combined[8] === 0x57 && combined[9] === 0x41 && combined[10] === 0x56 && combined[11] === 0x45

      let payloadBytes = combined
      let mime = ttsAudioMimeRef.current || 'audio/wav'

      if (!looksLikeWav) {
        const fmt = ttsFormatRef.current || { sampleRate: 48000, channels: 1, bitsPerSample: 16 }
        const header = createWavHeader(fmt, combined.length)
        const wav = new Uint8Array(header.length + combined.length)
        wav.set(header, 0)
        wav.set(combined, header.length)
        payloadBytes = wav
        mime = 'audio/wav'
      }

      const audioBlob = new Blob([payloadBytes], { type: mime })
      const url = URL.createObjectURL(audioBlob)
      ttsAudioUrlRef.current = url

      const audio = new Audio(url)
      ttsAudioElRef.current = audio

      isTtsPlayingRef.current = true

      audio.onended = () => {
        stopTtsPlayback()
        setIsAiProcessing(false)
        if (typeof onEnded === 'function') onEnded()
      }

      audio.onerror = (e) => {
        console.error('TTS: audio element error', e)
        stopTtsPlayback()
        setIsAiProcessing(false)
        if (typeof onEnded === 'function') onEnded()
      }

      await audio.play()
    } catch (e) {
      console.error('Error playing TTS audio:', e)
      stopTtsPlayback()
      setIsAiProcessing(false)
      if (typeof onEnded === 'function') onEnded()
    }
  }, [])

  const finalizeTTS = useCallback((utteranceId, reason = 'unknown') => {
    if (ttsActiveUtteranceIdRef.current !== utteranceId) return
    if (ttsIsFinalizingRef.current) return

    ttsIsFinalizingRef.current = true
    try {
      clearTtsTimers()

      if (ttsFlushTimeoutRef.current) {
        clearTimeout(ttsFlushTimeoutRef.current)
        ttsFlushTimeoutRef.current = null
      }

      const snapshot = audioChunksRef.current?.slice?.() || []
      audioChunksRef.current = []

      console.log('TTS finalized:', {
        reason,
        chunks: snapshot.length,
        bytes: snapshot.reduce((a, c) => a + c.length, 0),
      })

      ttsActiveUtteranceIdRef.current = 0
      ttsHasAudioRef.current = false
      ttsUtteranceStartedAtRef.current = 0

      playAudioFromChunks(snapshot, () => {
        // optional: ASR already running; keep as-is
        if (startWithAI && !startedOnceRef.current) {
          startedOnceRef.current = true
          startSpeechRecognition()
        }
      })
    } finally {
      ttsIsFinalizingRef.current = false
    }
  }, [clearTtsTimers, playAudioFromChunks, startWithAI, startSpeechRecognition])

  const scheduleTtsIdleFinalize = useCallback((utteranceId, idleMs = TTS_IDLE_MS) => {
    if (ttsIdleTimerRef.current) clearTimeout(ttsIdleTimerRef.current)
    ttsIdleTimerRef.current = setTimeout(() => {
      if (ttsActiveUtteranceIdRef.current !== utteranceId) return
      if (!ttsHasAudioRef.current) return
      const last = ttsStatsRef.current.lastAudioAt || 0
      if (!last) return
      if (Date.now() - last >= idleMs) finalizeTTS(utteranceId, 'idle-gap')
    }, idleMs)
  }, [finalizeTTS])

  const initializeTTSConnection = useCallback(() => {
    try {
      const myTtsId = ++ttsConnIdRef.current

      const dgKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
      if (!dgKey) {
        console.error('TTS: NEXT_PUBLIC_DEEPGRAM_API_KEY missing')
        setError('TTS disabled: missing NEXT_PUBLIC_DEEPGRAM_API_KEY')
        setIsAiProcessing(false)
        return
      }

      ttsAudioMimeRef.current = 'audio/wav'
      const ttsUrl = `wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=48000`
      ttsWsRef.current = new WebSocket(ttsUrl, ['token', dgKey])
      ttsWsRef.current.binaryType = 'arraybuffer'

      ttsWsRef.current.onopen = () => {
        if (ttsConnIdRef.current !== myTtsId) return
        console.log('TTS WebSocket connected')

        audioChunksRef.current = []
        ttsStatsRef.current = { chunks: 0, bytes: 0, lastAudioAt: 0, lastControlAt: Date.now() }
        ttsHasAudioRef.current = false
        ttsUtteranceStartedAtRef.current = 0

        if (pendingTtsTextRef.current) {
          const clean = pendingTtsTextRef.current
          pendingTtsTextRef.current = null

          const utteranceId = ++ttsUtteranceIdRef.current
          ttsActiveUtteranceIdRef.current = utteranceId
          ttsUtteranceStartedAtRef.current = Date.now()

          clearTtsTimers()
          audioChunksRef.current = []
          ttsStatsRef.current = { chunks: 0, bytes: 0, lastAudioAt: 0, lastControlAt: Date.now() }

          console.log('TTS → sending Speak/Flush', { chars: clean.length })
          ttsWsRef.current.send(JSON.stringify({ type: 'Speak', text: clean }))
          ttsWsRef.current.send(JSON.stringify({ type: 'Flush' }))

          // fallback only if no audio ever arrives
          if (ttsStartAsrTimerRef.current) clearTimeout(ttsStartAsrTimerRef.current)
          if (startWithAI && !startedOnceRef.current) {
            ttsStartAsrTimerRef.current = setTimeout(() => {
              if (!startedOnceRef.current && !ttsHasAudioRef.current) {
                startedOnceRef.current = true
                startSpeechRecognition()
              }
            }, 8000)
          }

          ttsHardTimerRef.current = setTimeout(() => {
            if (ttsActiveUtteranceIdRef.current !== utteranceId) return
            finalizeTTS(utteranceId, 'hard-timeout')
          }, TTS_HARD_TIMEOUT_MS)
        }
      }

      ttsWsRef.current.onmessage = async (event) => {
        if (ttsConnIdRef.current !== myTtsId) return
        const utteranceId = ttsActiveUtteranceIdRef.current
        if (!utteranceId) return

        if (event.data instanceof ArrayBuffer) {
          const chunk = new Uint8Array(event.data)
          audioChunksRef.current.push(chunk)
          ttsStatsRef.current.chunks += 1
          ttsStatsRef.current.bytes += chunk.length
          ttsStatsRef.current.lastAudioAt = Date.now()
          ttsHasAudioRef.current = true
          scheduleTtsIdleFinalize(utteranceId, TTS_IDLE_MS)
          return
        }

        if (event.data instanceof Blob) {
          const buf = await event.data.arrayBuffer()
          const chunk = new Uint8Array(buf)
          audioChunksRef.current.push(chunk)
          ttsStatsRef.current.chunks += 1
          ttsStatsRef.current.bytes += chunk.length
          ttsStatsRef.current.lastAudioAt = Date.now()
          ttsHasAudioRef.current = true
          scheduleTtsIdleFinalize(utteranceId, TTS_IDLE_MS)
          return
        }

        if (typeof event.data === 'string') {
          ttsStatsRef.current.lastControlAt = Date.now()
          try {
            const data = JSON.parse(event.data)
            const type = String(data?.type || '').toLowerCase()
            if (type === 'metadata') {
              const sr = Number(data?.sample_rate || data?.sampleRate)
              if (Number.isFinite(sr) && sr > 0) ttsFormatRef.current = { ...ttsFormatRef.current, sampleRate: sr }
              return
            }
            if (type === 'audio') {
              const b64 = data?.data || data?.audio || data?.chunk
              if (typeof b64 === 'string' && b64.length) {
                const bytes = base64ToUint8Array(b64)
                if (bytes) {
                  audioChunksRef.current.push(bytes)
                  ttsStatsRef.current.chunks += 1
                  ttsStatsRef.current.bytes += bytes.length
                  ttsStatsRef.current.lastAudioAt = Date.now()
                  ttsHasAudioRef.current = true
                  scheduleTtsIdleFinalize(utteranceId, TTS_IDLE_MS)
                }
              }
              return
            }
            if (type === 'done' || type === 'completed' || type === 'complete' || type === 'flushed') {
              finalizeTTS(utteranceId, type)
            }
          } catch {}
        }
      }

      ttsWsRef.current.onerror = (e) => {
        if (ttsConnIdRef.current !== myTtsId) return
        console.error('TTS WebSocket error:', e)
      }

      ttsWsRef.current.onclose = (evt) => {
        if (ttsConnIdRef.current !== myTtsId) return
        console.log('TTS WebSocket closed', { code: evt?.code, reason: evt?.reason })
      }
    } catch (e) {
      console.error('Failed to initialize TTS connection:', e)
      setIsAiProcessing(false)
    }
  }, [clearTtsTimers, finalizeTTS, scheduleTtsIdleFinalize, startWithAI, startSpeechRecognition])

  // ✅ WS-only sendTextToTTS (restored)
  const sendTextToTTS = useCallback((text) => {
    const clean = sanitizeForTTS(text)
    if (!clean) {
      setIsAiProcessing(false)
      return
    }

    setAiTtsReady(true)

    // reset buffers for new utterance
    audioChunksRef.current = []
    ttsStatsRef.current = { chunks: 0, bytes: 0, lastAudioAt: 0, lastControlAt: Date.now() }
    ttsHasAudioRef.current = false
    ttsUtteranceStartedAtRef.current = Date.now()

    // ensure ws open
    if (!ttsWsRef.current || ttsWsRef.current.readyState !== WebSocket.OPEN) {
      pendingTtsTextRef.current = clean
      initializeTTSConnection()
      return
    }

    const utteranceId = ++ttsUtteranceIdRef.current
    ttsActiveUtteranceIdRef.current = utteranceId

    clearTtsTimers()

    console.log('TTS → sending Speak/Flush', { chars: clean.length })
    ttsWsRef.current.send(JSON.stringify({ type: 'Speak', text: clean }))
    ttsWsRef.current.send(JSON.stringify({ type: 'Flush' }))

    // hard timeout
    ttsHardTimerRef.current = setTimeout(() => {
      if (ttsActiveUtteranceIdRef.current !== utteranceId) return
      finalizeTTS(utteranceId, 'hard-timeout')
    }, TTS_HARD_TIMEOUT_MS)
  }, [clearTtsTimers, finalizeTTS, initializeTTSConnection])

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

    // ✅ stop any in-flight playback
    stopTtsPlayback()

    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

    // ✅ clear TTS pending/timeout/timers
    pendingTtsTextRef.current = null
    clearTtsTimers()
    if (ttsFlushTimeoutRef.current) {
      clearTimeout(ttsFlushTimeoutRef.current)
      ttsFlushTimeoutRef.current = null
    }

    // ✅ reset TTS refs
    ttsHasAudioRef.current = false
    ttsUtteranceStartedAtRef.current = 0
    ttsActiveUtteranceIdRef.current = 0

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
      cleanupConnections()

      setIsConnecting(true)
      setError(null)

      latestDiscussionRef.current = room
      startedOnceRef.current = false
      asrConnIdRef.current = 0

      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })

      // ✅ Start ASR immediately so interview "starts" and UI becomes connected
      startSpeechRecognition()

      // ✅ Then play AI intro (ASR processing is ignored while TTS plays)
      if (startWithAI) {
        await generateAIIntro(room)
      }
    } catch (error) {
      console.error('Failed to connect:', error)
      setError('Failed to connect: ' + (error?.message || 'Unknown error'))
      setIsConnecting(false)
    }
  }, [cleanupConnections, startWithAI, generateAIIntro, startSpeechRecognition])

  const disconnect = useCallback(() => {
    disconnectingRef.current = true

    // ✅ stop any in-flight playback
    stopTtsPlayback()

    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current)

    pendingTtsTextRef.current = null
    clearTtsTimers()
    if (ttsFlushTimeoutRef.current) {
      clearTimeout(ttsFlushTimeoutRef.current)
      ttsFlushTimeoutRef.current = null
    }

    // ✅ reset TTS refs
    ttsHasAudioRef.current = false
    ttsUtteranceStartedAtRef.current = 0
    ttsActiveUtteranceIdRef.current = 0

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