'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import { AIModel } from '@/services/GlobalServices'

export const useWebSocketTranscription = () => {
  const [transcript, setTranscript] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [conversationHistory, setConversationHistory] = useState([])
  const [isPlayingTTS, setIsPlayingTTS] = useState(false)
  const [ttsError, setTtsError] = useState(null)
  
  // Refs for core functionality
  const connectionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const deepgramRef = useRef(null)
  const lastFinalTranscriptRef = useRef('')
  const processingTimeoutRef = useRef(null)
  const interviewContextRef = useRef({})
  const isInitialized = useRef(false)
  const audioContextRef = useRef(null)
  
  // Enhanced refs for solving the issues
  const currentAIRequestRef = useRef(null)
  const requestIdCounterRef = useRef(0)
  const ttsQueueRef = useRef([])
  const currentAudioSourceRef = useRef(null)
  const isProcessingTTSRef = useRef(false)
  const shouldProcessTTSRef = useRef(true)

  // Initialize Deepgram client and Audio Context
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitialized.current) {
      const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
      if (!apiKey) {
        setError('Please set NEXT_PUBLIC_DEEPGRAM_API_KEY in .env.local')
        return
      }
      
      try {
        deepgramRef.current = createClient(apiKey)
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
        isInitialized.current = true
        console.log('✅ Deepgram client and Audio Context created')
      } catch (err) {
        console.error('❌ Deepgram/Audio setup error:', err)
        setError(`Setup error: ${err.message}`)
      }
    }
  }, [])

  // Map practice option to expert type
  const mapPracticeOptionToExpert = useCallback((practiceOption) => {
    console.log('🔍 Mapping practice option:', practiceOption)
    
    const expertMap = {
      "Mock Interview": "Mock Interview",
      "TopicWise Preparation": "TopicWise Preparation", 
      "Ques- Answer Practice": "Ques- Answer Practice",
      "English Practice": "English Practice"
    }
    
    const mappedExpert = expertMap[practiceOption] || "Mock Interview"
    console.log('✅ Mapped to expert:', mappedExpert)
    
    return mappedExpert
  }, [])

  const initializeInterview = useCallback((discussionRoomData) => {
    if (discussionRoomData) {
      const expertType = mapPracticeOptionToExpert(discussionRoomData.practiceOption)
      
      interviewContextRef.current = {
        topic: discussionRoomData.practiceOption,
        expertType: expertType,
        interviewerName: discussionRoomData.interviewerName
      }
      
      // Clear all previous data
      setConversationHistory([])
      setAiResponse('')
      setTranscript('')
      setInterimTranscript('')
      lastFinalTranscriptRef.current = ''
      
      // Clear queues and requests
      currentAIRequestRef.current = null
      requestIdCounterRef.current = 0
      ttsQueueRef.current = []
      isProcessingTTSRef.current = false
      shouldProcessTTSRef.current = true
      
      console.log('🤖 Interview context initialized:', interviewContextRef.current)
    }
  }, [mapPracticeOptionToExpert])

  // Cancel previous AI requests and handle race conditions
  const cancelCurrentAIRequest = useCallback(() => {
    if (currentAIRequestRef.current) {
      console.log('🚫 Cancelling previous AI request')
      currentAIRequestRef.current.cancelled = true
      currentAIRequestRef.current = null
    }
    
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
      processingTimeoutRef.current = null
    }
  }, [])

  // Enhanced TTS Queue Management
  const clearTTSQueue = useCallback(() => {
    console.log('🧹 Clearing TTS queue and stopping audio')
    ttsQueueRef.current = []
    isProcessingTTSRef.current = false
    shouldProcessTTSRef.current = false
    
    // Stop current audio if playing
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop()
        currentAudioSourceRef.current = null
        console.log('🛑 Audio source stopped')
      } catch (error) {
        console.warn('⚠️ Error stopping audio source:', error)
      }
    }
    
    setIsPlayingTTS(false)
  }, [])

  // FIXED: Process TTS queue - allow processing even when disconnected
  const processTTSQueue = useCallback(async () => {
    if (isProcessingTTSRef.current || ttsQueueRef.current.length === 0 || !shouldProcessTTSRef.current) {
      if (!shouldProcessTTSRef.current) {
        console.log('🚫 TTS processing disabled, skipping queue')
      }
      return
    }

    isProcessingTTSRef.current = true
    console.log('🎵 Starting TTS queue processing...')
    
    while (ttsQueueRef.current.length > 0 && shouldProcessTTSRef.current) {
      const ttsItem = ttsQueueRef.current.shift()
      
      try {
        console.log(`🎤 Processing TTS item: ${ttsItem.requestId}`)
        await performTTS(ttsItem.text, ttsItem.requestId)
      } catch (error) {
        console.error('❌ TTS Queue processing error:', error)
      }
      
      // Small delay between TTS items to prevent overlap
      if (ttsQueueRef.current.length > 0 && shouldProcessTTSRef.current) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    isProcessingTTSRef.current = false
    console.log('✅ TTS queue processing completed')
  }, [])

  // FIXED: TTS conversion - works regardless of connection status
  const performTTS = useCallback(async (text, requestId) => {
    if (!text || text.trim().length === 0 || !shouldProcessTTSRef.current) {
      console.log(`🚫 Skipping TTS for request ${requestId} - no text or disabled`)
      return
    }

    console.log(`🎵 Processing TTS for request ${requestId}:`, text.substring(0, 50) + '...')
    setIsPlayingTTS(true)
    setTtsError(null)

    try {
      console.log('📡 Making TTS API request to /api/tts...')
      
      // Add timeout to the fetch request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text.trim() }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      console.log('📡 TTS API Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ TTS API Error Response:', errorText)
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
      }

      const contentType = response.headers.get('Content-Type')
      console.log('📡 Response Content-Type:', contentType)
      
      if (!contentType || !contentType.includes('audio')) {
        throw new Error(`Expected audio response, got: ${contentType}`)
      }

      console.log('🎵 Converting response to audio buffer...')
      const audioBuffer = await response.arrayBuffer()
      console.log('✅ Audio buffer received, size:', audioBuffer.byteLength, 'bytes')
      
      if (audioBuffer.byteLength === 0) {
        throw new Error('Received empty audio buffer')
      }
      
      // FIXED: Always play audio if we have TTS enabled (don't check connection)
      if (shouldProcessTTSRef.current) {
        console.log('🔊 Starting audio playback...')
        await playAudioBuffer(audioBuffer, requestId)
      } else {
        console.log(`🚫 Skipping audio playback for request ${requestId} - TTS disabled`)
      }
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('❌ TTS request timed out after 30 seconds')
        setTtsError('TTS request timed out')
      } else {
        console.error('❌ TTS Error for request', requestId, ':', error)
        setTtsError(`TTS failed: ${error.message}`)
      }
    } finally {
      if (ttsQueueRef.current.length === 0) {
        console.log('✅ TTS processing completed, setting isPlayingTTS to false')
        setIsPlayingTTS(false)
      }
    }
  }, [])

  // Enhanced audio playback
  const playAudioBuffer = async (arrayBuffer, requestId) => {
    try {
      if (!audioContextRef.current || !shouldProcessTTSRef.current) {
        console.log(`🚫 Skipping audio playback for request ${requestId} - context unavailable or TTS disabled`)
        return
      }

      if (audioContextRef.current.state === 'suspended') {
        console.log('🔊 Resuming audio context...')
        await audioContextRef.current.resume()
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice())
      
      // Stop previous audio source if playing
      if (currentAudioSourceRef.current) {
        try {
          currentAudioSourceRef.current.stop()
          console.log('🛑 Stopped previous audio source')
        } catch (error) {
          console.warn('⚠️ Error stopping previous audio:', error)
        }
      }
      
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)
      
      currentAudioSourceRef.current = source
      
      source.start(0)
      console.log(`🔊 Audio playback started for request ${requestId}, duration:`, audioBuffer.duration.toFixed(2), 'seconds')
      
      source.onended = () => {
        console.log(`✅ Audio playback completed for request ${requestId}`)
        if (currentAudioSourceRef.current === source) {
          currentAudioSourceRef.current = null
        }
        if (ttsQueueRef.current.length === 0) {
          setIsPlayingTTS(false)
        }
      }
      
      source.onerror = (error) => {
        console.error(`❌ Audio source error for request ${requestId}:`, error)
        if (currentAudioSourceRef.current === source) {
          currentAudioSourceRef.current = null
        }
        setTtsError('Audio playback failed')
        if (ttsQueueRef.current.length === 0) {
          setIsPlayingTTS(false)
        }
      }
      
    } catch (error) {
      console.error('❌ Audio playback error:', error)
      setTtsError(`Playback failed: ${error.message}`)
      if (ttsQueueRef.current.length === 0) {
        setIsPlayingTTS(false)
      }
    }
  }

  // Queue TTS with request tracking
  const queueTTS = useCallback((text, requestId) => {
    if (!text || text.trim().length === 0) {
      console.log(`🚫 Not queuing TTS for request ${requestId} - no text`)
      return
    }

    // Break long text into chunks for faster TTS
    const chunks = text.length > 200 ? chunkText(text) : [text]
    
    console.log(`📋 Queuing ${chunks.length} TTS chunks for request ${requestId}`)
    
    // Clear old queue and add new chunks
    ttsQueueRef.current = chunks.map((chunk, index) => ({
      text: chunk.trim(),
      requestId: `${requestId}-${index}`
    }))
    
    processTTSQueue()
  }, [processTTSQueue])

  // Text chunking function
  const chunkText = (text, maxLength = 200) => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const chunks = []
    let currentChunk = ''
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxLength && currentChunk) {
        chunks.push(currentChunk.trim() + '.')
        currentChunk = sentence
      } else {
        currentChunk += sentence + '.'
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }
    
    return chunks
  }

  // Enhanced AI Response Processing
  const processAIResponse = useCallback(async (finalText) => {
    if (!finalText || finalText === lastFinalTranscriptRef.current || finalText.trim().length < 3) {
      return
    }

    // Cancel any previous request
    cancelCurrentAIRequest()

    lastFinalTranscriptRef.current = finalText
    setIsAiProcessing(true)

    // Create new request with unique ID
    const requestId = ++requestIdCounterRef.current
    const requestTracker = { cancelled: false, id: requestId }
    currentAIRequestRef.current = requestTracker

    console.log(`🤖 Starting AI request ${requestId} for:`, finalText)

    processingTimeoutRef.current = setTimeout(async () => {
      if (requestTracker.cancelled) {
        console.log(`🚫 AI request ${requestId} was cancelled`)
        return
      }

      try {
        const context = interviewContextRef.current
        
        const result = await AIModel(
          context.topic || "general interview",
          context.expertType || "Mock Interview",
          finalText
        )
        
        if (requestTracker.cancelled) {
          console.log(`🚫 AI request ${requestId} was cancelled during processing`)
          return
        }
        
        if (result?.success && !requestTracker.cancelled) {
          setAiResponse(result.response)
          
          setConversationHistory(prev => [
            ...prev,
            { role: 'user', content: finalText },
            { role: 'assistant', content: result.response }
          ])
          
          console.log(`✅ AI response ${requestId} completed:`, result.response.substring(0, 50) + '...')
          
          // Queue TTS for this response
          queueTTS(result.response, requestId)
          
          setError(null)
        } else if (!requestTracker.cancelled) {
          console.error(`❌ AI response ${requestId} failed:`, result?.error)
          setError('AI response failed. Please try again.')
        }
      } catch (error) {
        if (!requestTracker.cancelled) {
          console.error(`❌ AI Processing Error for request ${requestId}:`, error)
          setError('AI processing failed. Please check your connection.')
        }
      } finally {
        if (!requestTracker.cancelled) {
          setIsAiProcessing(false)
        }
        if (currentAIRequestRef.current === requestTracker) {
          currentAIRequestRef.current = null
        }
      }
    }, 1500)
  }, [cancelCurrentAIRequest, queueTTS])

  // Connect function
  const connect = useCallback(async (discussionRoomData) => {
    if (isConnecting || isConnected) {
      console.log('⚠️ Already connecting or connected')
      return
    }

    if (!deepgramRef.current) {
      setError('Deepgram client not initialized')
      return
    }

    if (discussionRoomData) {
      initializeInterview(discussionRoomData)
    }

    shouldProcessTTSRef.current = true
    console.log('✅ TTS processing enabled')

    setIsConnecting(true)
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      streamRef.current = stream

      const connection = deepgramRef.current.listen.live({
        model: "nova-2",
        language: "en-US", 
        smart_format: true,
        interim_results: true,
        endpointing: 300,
        utterance_end_ms: 1000
      })

      connectionRef.current = connection

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('🔌 Deepgram connection opened')
        setIsConnected(true)
        setIsConnecting(false)
        setupMicrophoneStream(stream, connection)
      })

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        console.log('📝 Transcript:', data)
        
        if (data.channel?.alternatives?.[0]) {
          const transcript = data.channel.alternatives[0].transcript
          
          if (data.is_final && transcript.trim()) {
            setTranscript(prev => prev + ' ' + transcript)
            setInterimTranscript('')
            processAIResponse(transcript.trim())
          } else if (transcript.trim()) {
            setInterimTranscript(transcript)
          }
        }
      })

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('🔌 Connection closed')
        setIsConnected(false)
        setIsConnecting(false)
      })

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('❌ Deepgram error:', error)
        setError(`Connection error: ${error.message}`)
        setIsConnected(false)
        setIsConnecting(false)
      })

      connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        console.log('📊 Metadata:', data)
      })

    } catch (err) {
      console.error('❌ Connection error:', err)
      setError(`Failed to connect: ${err.message}`)
      setIsConnecting(false)
    }
  }, [initializeInterview, processAIResponse, isConnecting, isConnected])

  const setupMicrophoneStream = (stream, connection) => {
    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && connectionRef.current?.getReadyState() === 1) {
          console.log('🎤 Sending audio:', event.data.size, 'bytes')
          connectionRef.current.send(event.data)
        }
      }

      mediaRecorder.start(100)
      console.log('🎤 MediaRecorder started')
    } catch (error) {
      console.error('❌ MediaRecorder setup error:', error)
      setError(`Microphone setup failed: ${error.message}`)
    }
  }

  // FIXED: Don't disable TTS on disconnect - let responses play
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting...')
    
    // Cancel any pending AI requests
    cancelCurrentAIRequest()
    
    // DON'T disable TTS here - let it continue playing
    console.log('✅ TTS will continue playing after disconnect')
    
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
          console.log('🎤 MediaRecorder stopped')
        }
      } catch (error) {
        console.warn('⚠️ MediaRecorder stop error:', error)
      }
      mediaRecorderRef.current = null
    }

    if (connectionRef.current) {
      try {
        connectionRef.current.finish()
        console.log('🔌 Deepgram connection finished')
      } catch (error) {
        console.warn('⚠️ Connection finish error:', error)
      }
      connectionRef.current = null
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop()
          console.log('🎤 Track stopped:', track.kind)
        })
      } catch (error) {
        console.warn('⚠️ Stream stop error:', error)
      }
      streamRef.current = null
    }

    setIsConnected(false)
    setIsConnecting(false)
    setInterimTranscript('')
    setIsAiProcessing(false)
    lastFinalTranscriptRef.current = ''
    
    console.log('✅ Disconnect completed, TTS will continue')
  }, [cancelCurrentAIRequest])

  const clearTranscript = useCallback(() => {
    cancelCurrentAIRequest()
    clearTTSQueue()
    
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setConversationHistory([])
    setTtsError(null)
    lastFinalTranscriptRef.current = ''
    
    if (isConnected) {
      shouldProcessTTSRef.current = true
      console.log('✅ TTS re-enabled after clear')
    }
  }, [cancelCurrentAIRequest, clearTTSQueue, isConnected])

  // Manual TTS function
  const convertTextToSpeech = useCallback((text) => {
    if (!text || text.trim().length === 0) {
      console.warn('⚠️ No text for manual TTS')
      return
    }
    
    shouldProcessTTSRef.current = true
    const requestId = ++requestIdCounterRef.current
    queueTTS(text, requestId)
  }, [queueTTS])

  // Stop TTS function
  const stopTTS = useCallback(() => {
    clearTTSQueue()
    console.log('🛑 TTS manually stopped')
  }, [clearTTSQueue])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTTSQueue()
      disconnect()
    }
  }, [disconnect, clearTTSQueue])

  return {
    transcript,
    interimTranscript,
    aiResponse,
    isAiProcessing,
    conversationHistory,
    isConnected,
    isConnecting,
    error,
    isPlayingTTS,
    ttsError,
    connect,
    disconnect,
    clearTranscript,
    convertTextToSpeech,
    stopTTS
  }
}