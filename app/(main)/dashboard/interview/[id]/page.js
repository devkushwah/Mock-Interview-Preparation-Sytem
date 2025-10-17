'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'
import { Interviewer } from '@/services/options'
import { UserButton } from '@stackframe/stack'
import { Button } from "@/components/ui/button"
import dynamic from 'next/dynamic'

// Dynamic imports for client-side libraries
const RecordRTC = dynamic(() => import('recordrtc'), { ssr: false })

const InterviewPage = () => {
  const { id } = useParams()
  const [discussionRoomData, setDiscussionRoomData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enableMic, setEnableMic] = useState(false)
  const [recordRTCReady, setRecordRTCReady] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  
  const recorder = useRef(null)
  const silenceTimeout = useRef(null)

  // Load RecordRTC when component mounts
  useEffect(() => {
    const loadRecordRTC = async () => {
      try {
        const RecordRTCModule = await import('recordrtc')
        window.RecordRTC = RecordRTCModule.default
        setRecordRTCReady(true)
        console.log('RecordRTC loaded successfully')
      } catch (err) {
        console.error('Failed to load RecordRTC:', err)
        setError('Failed to load audio recording library')
      }
    }
    
    if (typeof window !== 'undefined') {
      loadRecordRTC()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorder.current) {
        recorder.current.stopRecording(() => {
          if (recorder.current.stream) {
            recorder.current.stream.getTracks().forEach(track => track.stop())
          }
        })
      }
      if (silenceTimeout.current) {
        clearTimeout(silenceTimeout.current)
      }
    }
  }, [])

  useEffect(() => {
    const fetchDiscussionRoom = async () => {
      if (!id) return

      try {
        setLoading(true)
        const docRef = doc(db, 'discussionRooms', id)
        const docSnap = await getDoc(docRef)
        
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() }
          setDiscussionRoomData(data)
          console.log('Discussion room data:', data)
        } else {
          setError('Discussion room not found')
        }
      } catch (err) {
        console.error('Error fetching discussion room:', err)
        setError('Failed to load interview room')
      } finally {
        setLoading(false)
      }
    }

    fetchDiscussionRoom()
  }, [id])

  // Get interviewer avatar from options
  const getInterviewerAvatar = (interviewerName) => {
    const interviewer = Interviewer.find(i => i.name === interviewerName)
    return interviewer?.avatar || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjE1IiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0yNSA3NUMyNSA2NS42IDMyLjYgNTggNDIgNThIMTU4QzY3LjQgNTggNzUgNjUuNiA3NSA3NVY4NUgyNVY3NVoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+'
  }

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

  const connectToServer = async () => {
    if (!recordRTCReady || !window.RecordRTC) {
      console.error('RecordRTC not ready yet')
      return
    }

    setIsConnecting(true)
    setEnableMic(true)

    try {
      // Initialize RecordRTC for audio recording
      if (typeof window !== "undefined" && typeof navigator !== "undefined") {
        navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        .then((stream) => {
          console.log('🎙️ Microphone stream obtained:', stream.getAudioTracks())

          recorder.current = new window.RecordRTC(stream, {
            type: 'audio',
            mimeType: 'audio/wav', // WAV better than WebM for speech
            recorderType: window.RecordRTC.StereoAudioRecorder,
            timeSlice: 1000, // Longer chunks for better accuracy
            desiredSampRate: 16000,
            numberOfAudioChannels: 1,
            bufferSize: 4096,
            audioBitsPerSecond: 128000,
            ondataavailable: async (blob) => {
              console.log('🎤 Audio chunk received:', blob.size, 'bytes')
              
              // Skip very small chunks
              if (blob.size < 1000) {
                console.log('⏭️ Skipping small audio chunk')
                return
              }
              
              if (silenceTimeout.current) {
                clearTimeout(silenceTimeout.current)
              }

              try {
                setIsTranscribing(true)
                console.log('📤 Sending to Deepgram API...')
                
                const resp = await fetch('/api/deepgram/transcribe', {
                  method: 'POST',
                  headers: { Accept: 'application/json' },
                  body: blob
                })

                console.log('📡 Deepgram response status:', resp.status)
                const json = await resp.json()
                console.log('📝 Deepgram response:', json)
                
                if (json.transcript && json.transcript.trim()) {
                  console.log('✅ Transcript received:', json.transcript, 'Confidence:', json.confidence)
                  
                  // Only add high confidence transcripts
                  if (json.confidence > 0.7) {
                    setTranscript(prev => {
                      const newTranscript = prev ? prev + ' ' + json.transcript : json.transcript
                      // Limit transcript length for performance
                      return newTranscript.slice(-2000)
                    })
                  } else {
                    console.log('⚠️ Low confidence transcript ignored:', json.confidence)
                  }
                } else if (json.error) {
                  console.error('❌ Deepgram error:', json.error)
                  setTranscriptionError('Transcription error: ' + json.error)
                }
              } catch (err) {
                console.error('🚨 Transcription request failed:', err)
                setTranscriptionError('Transcription request failed: ' + err.message)
              } finally {
                setIsTranscribing(false)
              }

              silenceTimeout.current = setTimeout(() => {
                console.log('🔇 User stopped talking')
              }, 3000) // Longer silence detection
            },
          })
          recorder.current.startRecording()
          console.log('Recording started')
        })
        .catch((err) => {
          console.error('Microphone access denied:', err)
          setEnableMic(false)
          setError('Microphone access denied. Please allow microphone access and try again.')
        })
      }
    } catch (err) {
      console.error('Error connecting to server:', err)
      setEnableMic(false)
      setError('Failed to connect to transcription service')
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = async (e) => {
    e.preventDefault()

    if (silenceTimeout.current) {
      clearTimeout(silenceTimeout.current)
      silenceTimeout.current = null
    }
    
    if (recorder.current) {
      recorder.current.stopRecording(() => {
        let blob = recorder.current.getBlob()
        // Do something with the recorded audio blob if needed
        if (recorder.current.stream) {
          recorder.current.stream.getTracks().forEach(track => track.stop())
        }
        recorder.current = null
      })
      console.log('Recording stopped')
    }
    
    setEnableMic(false)
    setTranscript('')
  }

  return (
   <div className='-mt-12'>  
       <h2 className='text-lg font-bold'>{discussionRoomData?.practiceOption}</h2> 

        
       <div className='mt-5 grid grid-cols-1 lg:grid-cols-3 gap-10'>

        <div className='lg:col-span-2'>
          <div className=' h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col  items-center justify-center relative' >
              <img
                  src={getInterviewerAvatar(discussionRoomData?.interviewerName)}
                  alt={discussionRoomData?.interviewerName || 'Interviewer'}
                  className='h-[80px] w-[80px] rounded-full object-cover animate-pulse'
              />
              <h2 className="text-gray-800">{discussionRoomData?.interviewerName}</h2>
              
              {/* Recording status indicator */}
              {enableMic && (
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-red-600">Recording</span>
                </div>
              )}
              
              <div className='p-5 bg-gray-200 px-10 rounded-lg absolute bottom-10 right-10' >
                <UserButton/>
              </div>
          </div>

            <div className="mt-5 flex items-center justify-center" >
              {enableMic ? 
                <Button variant="destructive" onClick={disconnect} disabled={isConnecting}>
                  Disconnect
                </Button>
                :
                <Button 
                  onClick={connectToServer} 
                  disabled={!recordRTCReady || isConnecting}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                >
                  {isConnecting ? 'Connecting...' : recordRTCReady ? 'Connect' : 'Loading...'}
                </Button>
              }
            </div>
        </div>

        <div>
             <div className='h-[60vh] bg-secondary border rounded-4xl p-4 flex flex-col items-center justify-start relative overflow-y-auto'>
              <h2 className="font-bold mb-4">Live Transcript</h2>
              
              {/* Audio level indicator */}
              {enableMic && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                  <div className={`bg-green-500 h-2 rounded-full transition-all duration-150 ${isTranscribing ? 'animate-pulse' : ''}`} 
                       style={{width: '50%'}}></div>
                </div>
              )}
              
              {transcriptionError && (
                <div className="text-red-500 text-xs mb-2 p-2 bg-red-50 rounded w-full">
                  {transcriptionError}
                </div>
              )}
              
              <div className="text-sm text-gray-700 p-2 w-full">
                {transcript || 'Start speaking to see transcription...'}
                {isTranscribing && (
                  <span className="inline-flex items-center ml-2">
                    <span className="animate-pulse text-blue-500">●</span>
                    <span className="text-xs text-gray-500 ml-1">Processing...</span>
                  </span>
                )}
              </div>
              
              {/* Word count */}
              {transcript && (
                <div className="text-xs text-gray-400 mt-2 self-end">
                  Words: {transcript.split(' ').length}
                </div>
              )}
            </div>
            <h2 className='mt-4 text-gray-600 text-sm'>At the end of your interview, you will receive feedback from the interviewer.</h2>
        </div>
       </div>
   </div>
  )
}

export default InterviewPage