'use client'

import { useState, useRef, useCallback } from 'react'

export const useWebSocketTranscription = (interviewContext, discussionRoomData, handleTranscriptReady, options = {}) => {
  const { startWithAI = false } = options;  // New flag

  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [conversationHistory, setConversationHistory] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState(null)

  // WebSocket and TTS refs
  const wsRef = useRef(null)
  const ttsWsRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioChunksRef = useRef([])
  
  // Speech detection control refs with better accumulation
  const speechTimeoutRef = useRef(null)
  const accumulatedTranscriptRef = useRef('') // Store complete accumulated transcript
  const lastProcessedTranscriptRef = useRef('')
  const lastSpeechTimeRef = useRef(Date.now())

  // Initialize TTS WebSocket connection
  const initializeTTSConnection = useCallback(() => {
    try {
      const ttsUrl = `wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=48000`
      
      ttsWsRef.current = new WebSocket(ttsUrl, ['token', process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY])
      
      // WAV header for audio playback
      const wavHeader = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // "RIFF"
        0x00, 0x00, 0x00, 0x00, // Placeholder for file size
        0x57, 0x41, 0x56, 0x45, // "WAVE"
        0x66, 0x6D, 0x74, 0x20, // "fmt "
        0x10, 0x00, 0x00, 0x00, // Chunk size (16)
        0x01, 0x00,             // Audio format (1 for PCM)
        0x01, 0x00,             // Number of channels (1)
        0x80, 0xBB, 0x00, 0x00, // Sample rate (48000)
        0x00, 0xEE, 0x02, 0x00, // Byte rate (48000 * 2)
        0x02, 0x00,             // Block align (2)
        0x10, 0x00,             // Bits per sample (16)
        0x64, 0x61, 0x74, 0x61, // "data"
        0x00, 0x00, 0x00, 0x00  // Placeholder for data size
      ])

      ttsWsRef.current.onopen = () => {
        console.log('TTS WebSocket connected')
        audioChunksRef.current = [wavHeader]
      }

      ttsWsRef.current.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer()
          const audioData = new Uint8Array(arrayBuffer)
          audioChunksRef.current.push(audioData)
        } else {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'Flushed') {
              console.log('TTS Flushed - playing audio')
              playAudioChunks()
            }
          } catch (e) {
            console.log('TTS message:', event.data)
          }
        }
      }

      ttsWsRef.current.onerror = (error) => {
        console.error('TTS WebSocket error:', error)
      }

      ttsWsRef.current.onclose = () => {
        console.log('TTS WebSocket closed')
      }

    } catch (error) {
      console.error('Failed to initialize TTS connection:', error)
    }
  }, [])

  // Play accumulated audio chunks
  const playAudioChunks = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }

      const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0)
      const combinedArray = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of audioChunksRef.current) {
        combinedArray.set(chunk, offset)
        offset += chunk.length
      }

      const audioBlob = new Blob([combinedArray], { type: 'audio/wav' })
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        setIsAiProcessing(false)
      }

      await audio.play()
      
      // Reset chunks for next response
      audioChunksRef.current = [audioChunksRef.current[0]] // Keep header

    } catch (error) {
      console.error('Error playing audio:', error)
      setIsAiProcessing(false)
    }
  }, [])

  // Send text to TTS for streaming synthesis
  const sendTextToTTS = useCallback((text) => {
    if (ttsWsRef.current?.readyState === WebSocket.OPEN) {
      ttsWsRef.current.send(JSON.stringify({
        type: 'Speak',
        text: text
      }))

      ttsWsRef.current.send(JSON.stringify({
        type: 'Flush'
      }))
    }
  }, [])

  // Generate AI response with complete accumulated transcript
  const generateAIResponse = useCallback(async (completeTranscript, discussionRoomData) => {
    try {
      // Prevent multiple concurrent AI calls
      if (isAiProcessing) return

      // Check if input is meaningful (not just partial speech)
      if (!completeTranscript || completeTranscript.trim().length < 5) return

      setIsAiProcessing(true)
      setAiResponse('')

      console.log('🎤 Processing complete accumulated transcript:', completeTranscript)
      console.log('📤 Sending to chat API:', {
        message: completeTranscript,
        context: {
          topic: discussionRoomData?.topic,
          practiceOption: discussionRoomData?.practiceOption,
          interviewerName: discussionRoomData?.interviewerName,
        },
        discussionRoomId: discussionRoomData?.id
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: completeTranscript,
          context: {
            topic: discussionRoomData?.topic,
            practiceOption: discussionRoomData?.practiceOption,
            interviewerName: discussionRoomData?.interviewerName,
          },
          discussionRoomId: discussionRoomData?.id // <-- ADD THIS LINE
        }),
      })

      if (!response.ok) return

      const data = await response.json()
      const aiMessage = data.response

      setAiResponse(aiMessage)
      
      // Add messages to conversation
      const userMessage = { role: 'user', content: completeTranscript }
      const assistantMessage = { role: 'assistant', content: aiMessage }
      setConversationHistory(prev => [...prev, userMessage, assistantMessage])

      // Send AI response to TTS for streaming audio
      sendTextToTTS(aiMessage)

      // Clear accumulated transcript after processing
      accumulatedTranscriptRef.current = ''
      lastProcessedTranscriptRef.current = completeTranscript

    } catch (error) {
      console.error('Error generating AI response:', error)
      setError('Failed to generate response')
      setIsAiProcessing(false)
    }
  }, [sendTextToTTS, isAiProcessing])

  // Improved speech completion handling with transcript accumulation
  const handleSpeechComplete = useCallback((finalTranscript, discussionRoomData) => {
    // Clear any existing timeout
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }

    // Accumulate the new transcript part
    if (finalTranscript && finalTranscript.trim()) {
      // Add space if there's already accumulated text
      const separator = accumulatedTranscriptRef.current ? ' ' : ''
      accumulatedTranscriptRef.current += separator + finalTranscript.trim()
      
      console.log('📝 Accumulated transcript so far:', accumulatedTranscriptRef.current)
    }

    // Update last speech time
    lastSpeechTimeRef.current = Date.now()

    console.log('⏱️ User paused, waiting 1.5 seconds for more input...')  // Updated from 0.5 to 1.5

    // Wait 1.5 seconds after final transcript to ensure user is done speaking  // Updated from 0.5 to 1.5
    speechTimeoutRef.current = setTimeout(() => {
      // Double check that no new speech has started in the meantime
      const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current
      
      if (timeSinceLastSpeech >= 1500 && accumulatedTranscriptRef.current.trim()) {  // Changed from 500 to 1500
        const completeTranscript = accumulatedTranscriptRef.current.trim()
        
        // Only process if we have new content
        if (completeTranscript !== lastProcessedTranscriptRef.current) {
          console.log('✅ 1.5 seconds passed, processing complete transcript:', completeTranscript)  // Updated from 0.5 to 1.5
          generateAIResponse(completeTranscript, discussionRoomData)
        } else {
          console.log('🔄 Same transcript already processed, skipping...')
        }
      } else if (timeSinceLastSpeech < 1500) {  // Changed from 500 to 1500
        console.log('🔄 User still speaking, extending wait time...')
        // If user spoke again within the timeout, restart the timer
        handleSpeechComplete('', discussionRoomData) // Empty string since we already accumulated
      }
    }, 1500)  // Changed from 500 to 1500

  }, [generateAIResponse])

  const connect = useCallback(async (discussionRoomData) => {
    try {
      setIsConnecting(true)
      setError(null)

      // Initialize TTS connection first
      initializeTTSConnection()

      // Get user media for speech recognition
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Initialize Deepgram WebSocket with better settings for continuous speech
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1500&vad_events=true&punctuate=true`
      
      wsRef.current = new WebSocket(wsUrl, ['token', process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY])

      wsRef.current.onopen = () => {
        console.log('Speech recognition WebSocket connected')
        setIsConnected(true)
        setIsConnecting(false)

        // Setup media recorder
        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        })

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(event.data)
          }
        }

        mediaRecorderRef.current.start(100)
      }

      wsRef.current.onmessage = async (event) => {
        const data = JSON.parse(event.data)
        
        if (data.channel?.alternatives?.[0]) {
          const transcript = data.channel.alternatives[0].transcript
          
          if (data.is_final && transcript.trim()) {
            console.log('📝 Final transcript chunk received:', transcript)
            setTranscript(accumulatedTranscriptRef.current + ' ' + transcript) // Show accumulated + new
            setInterimTranscript('')
            
            // Update last speech time whenever we get final transcript
            lastSpeechTimeRef.current = Date.now()
            
            // Handle speech completion with accumulation
            handleSpeechComplete(transcript, discussionRoomData)
            
          } else if (transcript) {
            // Show interim results but don't accumulate them
            lastSpeechTimeRef.current = Date.now()
            setInterimTranscript(transcript)
          }
        }

        // Handle voice activity detection events
        if (data.type === 'UtteranceEnd') {
          console.log('🔇 Utterance ended - user paused speaking')
          // Don't immediately process, let the timeout handle it
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('Speech recognition WebSocket error:', error)
        setError('Connection error occurred')
        setIsConnecting(false)
      }

      wsRef.current.onclose = () => {
        console.log('Speech recognition WebSocket closed')
        setIsConnected(false)
        setIsConnecting(false)
      }

      // If startWithAI is true, generate initial AI response
      if (startWithAI) {
        const initialTranscript = accumulatedTranscriptRef.current
        if (initialTranscript) {
          console.log('🤖 Generating initial AI response based on accumulated transcript:', initialTranscript)
          generateAIResponse(initialTranscript, discussionRoomData)
        } else {
          console.log('🕒 No initial transcript available, AI response will be generated after user speaks')
        }
      }

    } catch (error) {
      console.error('Failed to connect:', error)
      setError('Failed to connect: ' + error.message)
      setIsConnecting(false)
    }
  }, [initializeTTSConnection, handleSpeechComplete, startWithAI])

  const disconnect = useCallback(() => {
    // Clear all timeouts
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }

    // Close speech recognition WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Close TTS WebSocket
    if (ttsWsRef.current) {
      ttsWsRef.current.send(JSON.stringify({ type: 'Close' }))
      ttsWsRef.current.close()
      ttsWsRef.current = null
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    setIsConnected(false)
    setIsAiProcessing(false)
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    accumulatedTranscriptRef.current = ''
    lastProcessedTranscriptRef.current = ''
    lastSpeechTimeRef.current = Date.now()
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

  // New function to process transcript and send to AI
  const processTranscript = async (finalTranscript) => {
    try {
      console.log('📤 About to send message to chat API:', { 
        message: finalTranscript,
        discussionRoomId: discussionRoomData?.id,
        hasContext: !!interviewContext 
      })
      
      // Add this debug check
      if (!discussionRoomData?.id) {
        console.error('❌ discussionRoomId missing!', discussionRoomData)
        return
      }
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: finalTranscript,
          context: interviewContext,
          discussionRoomId: discussionRoomData.id // Make sure this is included
        })
      })
      
      console.log('📤 Chat API response status:', response.status)
      
      if (!response.ok) {
        console.error('❌ Chat API response not ok:', response.status, response.statusText)
        return
      }
      
      const data = await response.json()
      console.log('✅ Received AI response:', data)
      
      if (data.response) {
        // TTS and other processing...
        console.log('✅ Processing AI response for TTS:', data.response.substring(0, 50) + '...')
      }
      
    } catch (error) {
      console.error('❌ Error in processTranscript:', error)
    }
  }

  return {
    transcript,
    interimTranscript,
    aiResponse,
    isAiProcessing,
    conversationHistory,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    clearTranscript
  }
}