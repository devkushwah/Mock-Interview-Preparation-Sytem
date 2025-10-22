'use client'

import { useState, useRef, useCallback } from 'react'

export const useWebSocketTranscription = () => {
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
  
  // Speech detection control refs
  const speechTimeoutRef = useRef(null)
  const lastFinalTranscriptRef = useRef('')
  const silenceTimeoutRef = useRef(null)

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

  // Generate AI response with proper speech completion detection
  const generateAIResponse = useCallback(async (userInput, discussionRoomData) => {
    try {
      // Prevent multiple concurrent AI calls
      if (isAiProcessing) {
        console.log('🚫 AI already processing, skipping...')
        return
      }

      // Check if input is meaningful (not just partial speech)
      if (!userInput || userInput.trim().length < 5) {
        console.log('🚫 Input too short, waiting for more...')
        return
      }

      setIsAiProcessing(true)
      setAiResponse('')

      console.log('🎤 Processing complete user input:', userInput)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userInput,
          context: {
            topic: discussionRoomData?.topic,
            practiceOption: discussionRoomData?.practiceOption,
            interviewerName: discussionRoomData?.interviewerName,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()
      const aiMessage = data.response

      setAiResponse(aiMessage)
      
      // Add messages to conversation
      const userMessage = { role: 'user', content: userInput }
      const assistantMessage = { role: 'assistant', content: aiMessage }
      setConversationHistory(prev => [...prev, userMessage, assistantMessage])

      // Send AI response to TTS for streaming audio
      sendTextToTTS(aiMessage)

    } catch (error) {
      console.error('Error generating AI response:', error)
      setError('Failed to generate response')
      setIsAiProcessing(false)
    }
  }, [sendTextToTTS, isAiProcessing])

  // Handle speech completion with improved timing
  const handleSpeechComplete = useCallback((finalTranscript, discussionRoomData) => {
    // Clear any existing timeout
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }

    // Avoid processing the same transcript multiple times
    if (finalTranscript === lastFinalTranscriptRef.current) {
      console.log('🔄 Duplicate transcript, skipping...')
      return
    }

    // Wait for a short silence to ensure speech is truly complete
    speechTimeoutRef.current = setTimeout(() => {
      if (finalTranscript.trim() && finalTranscript !== lastFinalTranscriptRef.current) {
        console.log('✅ Speech completed, processing:', finalTranscript)
        lastFinalTranscriptRef.current = finalTranscript
        generateAIResponse(finalTranscript, discussionRoomData)
      }
    }, 800) // Wait 800ms after final transcript before processing

  }, [generateAIResponse])

  const connect = useCallback(async (discussionRoomData) => {
    try {
      setIsConnecting(true)
      setError(null)

      // Initialize TTS connection first
      initializeTTSConnection()

      // Get user media for speech recognition
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Initialize Deepgram WebSocket for speech recognition with better settings
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=en-US&smart_format=true&interim_results=true&endpointing=500&utterance_end_ms=1500&vad_events=true`
      
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
            console.log('📝 Final transcript received:', transcript)
            setTranscript(transcript)
            setInterimTranscript('')
            
            // Handle speech completion with improved timing
            handleSpeechComplete(transcript, discussionRoomData)
            
          } else if (transcript) {
            // Show interim results but don't process them
            setInterimTranscript(transcript)
          }
        }

        // Handle voice activity detection events
        if (data.type === 'UtteranceEnd') {
          console.log('🔇 Utterance ended - user stopped speaking')
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
          }
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

    } catch (error) {
      console.error('Failed to connect:', error)
      setError('Failed to connect: ' + error.message)
      setIsConnecting(false)
    }
  }, [initializeTTSConnection, handleSpeechComplete])

  const disconnect = useCallback(() => {
    // Clear all timeouts
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
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
    lastFinalTranscriptRef.current = ''
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setConversationHistory([])
    audioChunksRef.current = []
    lastFinalTranscriptRef.current = ''
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
    connect,
    disconnect,
    clearTranscript
  }
}