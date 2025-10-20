'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import { AIModel } from '@/services/GlobalServices'
import { ExpertsList } from '@/services/options'

export const useWebSocketTranscription = () => {
  const [transcript, setTranscript] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [isAiProcessing, setIsAiProcessing] = useState(false)
  const [conversationHistory, setConversationHistory] = useState([])
  
  const connectionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const deepgramRef = useRef(null)
  const lastFinalTranscriptRef = useRef('')
  const processingTimeoutRef = useRef(null)
  const interviewContextRef = useRef({})
  const isInitialized = useRef(false)

  // Initialize Deepgram client following system patterns
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitialized.current) {
      const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
      if (!apiKey) {
        setError('Please set NEXT_PUBLIC_DEEPGRAM_API_KEY in .env.local')
        return
      }
      
      try {
        deepgramRef.current = createClient(apiKey)
        isInitialized.current = true
        console.log('✅ Deepgram client created')
      } catch (err) {
        console.error('❌ Deepgram client error:', err)
        setError(`Deepgram client error: ${err.message}`)
      }
    }
  }, [])

  // Map practice option to expert type following system patterns
  const mapPracticeOptionToExpert = useCallback((practiceOption) => {
    console.log('🔍 Mapping practice option:', practiceOption);
    console.log('📋 Available experts:', ExpertsList?.map(e => e.name));
    
    const expertMap = {
      "Mock Interview": "Mock Interview",
      "TopicWise Preparation": "TopicWise Preparation", 
      "Ques- Answer Practice": "Ques- Answer Practice",
      "English Practice": "English Practice"
    }
    
    const mappedExpert = expertMap[practiceOption] || "Mock Interview"
    console.log('✅ Mapped to expert:', mappedExpert);
    
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
      
      setConversationHistory([])
      setAiResponse('')
      setTranscript('')
      setInterimTranscript('')
      lastFinalTranscriptRef.current = ''
      
      console.log('🤖 Interview context initialized:', interviewContextRef.current)
    }
  }, [mapPracticeOptionToExpert])

  const processAIResponse = useCallback(async (finalText) => {
    if (!finalText || finalText === lastFinalTranscriptRef.current || finalText.trim().length < 3) {
      return
    }

    lastFinalTranscriptRef.current = finalText
    setIsAiProcessing(true)

    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
    }

    processingTimeoutRef.current = setTimeout(async () => {
      try {
        const context = interviewContextRef.current
        
        console.log('🤖 Processing AI response with context:', context);
        
        // Call AIModel with proper parameters following system patterns
        const result = await AIModel(
          context.topic || "general interview",  // topic parameter
          context.expertType || "Mock Interview", // expertType parameter
          finalText            // user message
        )
        
        if (result?.success) {
          setAiResponse(result.response)
          
          setConversationHistory(prev => [
            ...prev,
            { role: 'user', content: finalText },
            { role: 'assistant', content: result.response }
          ])
          
          console.log('✅ AI response updated:', result.response)
          
          // Clear any previous errors
          setError(null)
        } else {
          console.error('❌ AI response failed:', result?.error)
          setError('AI response failed. Please try again.')
        }
      } catch (error) {
        console.error('❌ AI Processing Error:', error)
        setError('AI processing failed. Please check your connection.')
      } finally {
        setIsAiProcessing(false)
      }
    }, 1500)
  }, [conversationHistory])

  const connect = useCallback(async (discussionRoomData) => {
    if (isConnecting || isConnected) {
      console.log('⚠️ Already connecting/connected')
      return
    }

    if (!deepgramRef.current) {
      setError('Deepgram client not initialized')
      return
    }

    if (discussionRoomData) {
      initializeInterview(discussionRoomData)
    }

    setIsConnecting(true)
    setError(null)

    try {
      console.log('🎤 Requesting microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      console.log('✅ Microphone access granted')
      streamRef.current = stream

      // Create Deepgram connection following working example pattern
      const connection = deepgramRef.current.listen.live({
        model: 'nova-3',
        language: 'en-US',
        smart_format: true,
        interim_results: true,
        punctuate: true,
        endpointing: 300
      })

      connectionRef.current = connection

      // Event listeners nested inside Open (exact pattern from working example)
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('🚀 Connection opened')
        setIsConnected(true)
        setIsConnecting(false)

        connection.on(LiveTranscriptionEvents.Close, () => {
          console.log('🔌 Connection closed')
          setIsConnected(false)
          setIsConnecting(false)
        })

        connection.on(LiveTranscriptionEvents.Transcript, (data) => {
          console.log('📝 Transcript:', data)
          
          const transcriptText = data.channel?.alternatives?.[0]?.transcript || ''
          
          if (transcriptText && transcriptText.trim()) {
            if (data.is_final) {
              console.log('✅ Final:', transcriptText)
              
              setTranscript(prev => prev ? `${prev} ${transcriptText}` : transcriptText)
              setInterimTranscript('')
              processAIResponse(transcriptText)
              
            } else {
              console.log('⏳ Interim:', transcriptText)
              setInterimTranscript(transcriptText)
            }
          }
        })

        connection.on(LiveTranscriptionEvents.Metadata, (data) => {
          console.log('📊 Metadata:', data)
        })

        connection.on(LiveTranscriptionEvents.Error, (err) => {
          console.error('❌ Error:', err)
          setError(`Transcription error: ${err.message}`)
        })

        // Setup microphone streaming
        setupMicrophoneStream(stream, connection)
      })

    } catch (err) {
      console.error('🚨 Setup error:', err)
      setError(err.message)
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
        if (event.data.size > 0 && connection) {
          console.log('🎤 Sending audio:', event.data.size, 'bytes')
          connection.send(event.data)
        }
      }

      mediaRecorder.start(100)
      console.log('🎤 Recording started')
      
    } catch (error) {
      console.error('❌ MediaRecorder setup failed:', error)
      setError(`Recording setup failed: ${error.message}`)
    }
  }

  // Disconnect with proper null checks following system patterns
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting...')
    
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
      processingTimeoutRef.current = null
    }

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
  }, [])

  const clearTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setConversationHistory([])
    lastFinalTranscriptRef.current = ''
  }, [])

  // Cleanup on unmount with error boundary following system patterns
  useEffect(() => {
    return () => {
      try {
        disconnect()
      } catch (error) {
        console.warn('⚠️ Cleanup error:', error)
      }
    }
  }, [disconnect])

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