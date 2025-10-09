'use client'

import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams } from 'next/navigation';
import { UserContext } from '@/app/_context/UserContext';
import { getDiscussionById, addMessageToConversation } from '@/services/firebase/discussionService';
import { Mic, MicOff, Volume2, VolumeX, Camera, CameraOff, Play } from 'lucide-react';

const VoiceInterviewRoom = () => {
  const params = useParams();
  const { userData } = useContext(UserContext);
  const [discussion, setDiscussion] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Voice states
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Camera states
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  
  // Interview states
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [liveConversation, setLiveConversation] = useState([]);
  
  // Refs
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioRef = useRef(null);
  const conversationEndRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (params.id) {
      loadDiscussion();
      initializeVoiceRecognition();
    }
    
    return () => {
      cleanup();
    };
  }, [params.id]);

  // Auto scroll conversation only
  useEffect(() => {
    if (interviewStarted && conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveConversation, interviewStarted]);

  const loadDiscussion = async () => {
    try {
      setLoading(true);
      const discussionData = await getDiscussionById(params.id);
      setDiscussion(discussionData);
      
      // Don't show existing conversation - keep it fresh
      setLiveConversation([]);
      setInterviewStarted(false);
      
    } catch (error) {
      console.error('Error loading discussion:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeVoiceRecognition = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      // Setup audio context for visualizer
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      let audioChunks = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          audioChunks = [];
          await processAudioToText(audioBlob);
        }
      };
      
      startAudioLevelMonitoring();
      
    } catch (error) {
      console.error('Error initializing voice recognition:', error);
      alert('Microphone access is required for voice interview. Please enable and refresh.');
    }
  };

  const initializeCamera = async () => {
    try {
      setCameraError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 240 },
          height: { ideal: 180 },
          facingMode: 'user'
        },
        audio: false // Don't request audio again
      });
      
      console.log('Camera stream obtained:', stream);
      setCameraStream(stream);
      setIsCameraOn(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for metadata to load before playing
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded, starting playback');
          videoRef.current.play().catch(e => {
            console.error('Video play failed:', e);
            setCameraError('Failed to start video playback');
          });
        };
        
        videoRef.current.onerror = (e) => {
          console.error('Video element error:', e);
          setCameraError('Video playback error');
        };
      }
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError('Camera access denied');
      setIsCameraOn(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped camera track:', track.kind);
      });
      setCameraStream(null);
    }
    
    setIsCameraOn(false);
    setCameraError(null);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      initializeCamera();
    }
  };

  const startAudioLevelMonitoring = () => {
    const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount || 128);
    
    const updateAudioLevel = () => {
      if (analyserRef.current && isRecording) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average);
      }
      requestAnimationFrame(updateAudioLevel);
    };
    
    updateAudioLevel();
  };

  const startInterview = async () => {
    if (!discussion) return;
    
    setInterviewStarted(true);
    
    const greeting = `Hello! I'm ${discussion.interviewerName}, and I'll be conducting your ${discussion.practiceOption} interview today. We'll be discussing ${discussion.topic}. Please start by introducing yourself.`;
    
    const greetingMessage = {
      id: Date.now().toString(),
      content: greeting,
      sender: 'interviewer',
      type: 'voice',
      timestamp: new Date().toISOString(),
      metadata: { isGreeting: true }
    };
    
    setLiveConversation([greetingMessage]);
    await addMessageToConversation(params.id, greetingMessage);
    await convertTextToSpeech(greeting);
  };

  const startRecording = () => {
    if (mediaRecorderRef.current && !isRecording && interviewStarted) {
      setIsRecording(true);
      setCurrentTranscript('Listening...');
      mediaRecorderRef.current.start();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      setCurrentTranscript('Processing...');
      mediaRecorderRef.current.stop();
    }
  };

  const processAudioToText = async (audioBlob) => {
    try {
      setIsProcessingVoice(true);
      setCurrentTranscript('Converting speech to text...');
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const mockTranscript = "Thank you for the question. I have experience working with Java for backend development.";
      setCurrentTranscript(mockTranscript);
      
      const userMessage = {
        id: Date.now().toString(),
        content: mockTranscript,
        sender: 'user',
        type: 'voice',
        timestamp: new Date().toISOString(),
        metadata: { confidence: 0.9 }
      };
      
      setLiveConversation(prev => [...prev, userMessage]);
      await addMessageToConversation(params.id, userMessage);
      await generateAIResponse(mockTranscript);
      
    } catch (error) {
      console.error('Error processing audio to text:', error);
      setCurrentTranscript('Error processing voice. Please try again.');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const generateAIResponse = async (userMessage) => {
    try {
      setIsGeneratingResponse(true);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockResponse = `That's great! Can you tell me about a specific Java project you worked on?`;
      
      const aiMessage = {
        id: Date.now().toString() + '_ai',
        content: mockResponse,
        sender: 'interviewer',
        type: 'voice',
        timestamp: new Date().toISOString(),
        metadata: { 
          generatedBy: 'mock',
          responseTime: Date.now() 
        }
      };
      
      setLiveConversation(prev => [...prev, aiMessage]);
      await addMessageToConversation(params.id, aiMessage);
      await convertTextToSpeech(mockResponse);
      
    } catch (error) {
      console.error('Error generating AI response:', error);
    } finally {
      setIsGeneratingResponse(false);
    }
  };

  const convertTextToSpeech = async (text) => {
    try {
      if (!isMuted) {
        setIsPlaying(true);
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('Error converting text to speech:', error);
    }
  };

  const cleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    stopCamera();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
          <p className="mt-2 text-sm">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (!discussion) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600">Interview Not Found</h2>
          <p className="mt-1 text-sm">The interview session could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden p-4">
      {/* Compact Header */}
      <div className="flex-shrink-0 mb-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
        <h1 className="text-lg font-bold mb-2">{discussion.practiceOption} - Voice Interview</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><strong>Topic:</strong> {discussion.topic}</div>
          <div><strong>Interviewer:</strong> {discussion.interviewerName}</div>
          <div><strong>Status:</strong> 
            <span className={`ml-1 px-2 py-1 rounded text-xs ${
              interviewStarted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {interviewStarted ? 'active' : 'ready'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-1 rounded ${isMuted ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
              title={isMuted ? 'Unmute AI' : 'Mute AI'}
            >
              {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <button
              onClick={toggleCamera}
              className={`p-1 rounded ${isCameraOn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}
              title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraOn ? <Camera size={14} /> : <CameraOff size={14} />}
            </button>
            {isPlaying && <span className="text-xs text-blue-600">AI Speaking...</span>}
            {isGeneratingResponse && <span className="text-xs text-orange-600">AI Thinking...</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left Side - Voice Controls & Camera */}
        <div className="w-1/2 flex flex-col min-h-0">
          
          {/* Voice Interface - Compact */}
          <div className="flex-1 p-4 border rounded-lg bg-gray-50 flex flex-col items-center justify-center min-h-0">
            {!interviewStarted ? (
              <div className="text-center">
                <h3 className="text-base font-semibold mb-2">Ready to Start</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Begin your voice interview with {discussion.interviewerName}
                </p>
                <button
                  onClick={startInterview}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 text-sm"
                >
                  <Play size={16} />
                  Start Interview
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-4">
                  <h3 className="text-base font-semibold mb-1">Voice Interface</h3>
                  <p className="text-xs text-gray-600">
                    {isRecording ? 'Listening...' : 'Click mic to speak'}
                  </p>
                </div>

                {/* Compact Audio Visualizer */}
                <div className="mb-4">
                  <div className={`w-24 h-24 rounded-full border-3 flex items-center justify-center transition-all duration-300 ${
                    isRecording 
                      ? 'border-red-500 bg-red-50 shadow-lg' 
                      : 'border-blue-500 bg-blue-50'
                  }`}>
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isProcessingVoice || isGeneratingResponse || isPlaying}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                        isRecording
                          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                          : 'bg-blue-500 hover:bg-blue-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      style={{
                        transform: isRecording ? `scale(${1 + audioLevel / 600})` : 'scale(1)'
                      }}
                    >
                      {isRecording ? (
                        <MicOff className="text-white" size={24} />
                      ) : (
                        <Mic className="text-white" size={24} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Compact Status */}
                <div className="text-center">
                  {currentTranscript && (
                    <div className="p-2 bg-white border rounded-lg mb-3 max-w-sm">
                      <p className="text-xs font-medium text-gray-700">
                        {currentTranscript}
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    {isProcessingVoice && (
                      <p className="text-xs text-orange-600">🎙️ Processing...</p>
                    )}
                    {isGeneratingResponse && (
                      <p className="text-xs text-blue-600">🤖 AI thinking...</p>
                    )}
                    {isPlaying && (
                      <p className="text-xs text-green-600">🔊 AI speaking...</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Compact Camera Preview */}
          {isCameraOn && (
            <div className="mt-3 relative flex-shrink-0">
              <video 
                ref={videoRef}
                className="w-full h-24 bg-gray-900 rounded-lg object-cover"
                autoPlay
                muted
                playsInline
                style={{ transform: 'scaleX(-1)' }} // Mirror effect
              />
              <div className="absolute top-1 right-1 bg-red-500 text-white px-1 py-0.5 rounded text-xs">
                LIVE
              </div>
              {cameraError && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center rounded-lg">
                  <p className="text-white text-xs text-center px-2">{cameraError}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side - Compact Conversation */}
        <div className="w-1/2 flex flex-col min-h-0">
          <h3 className="text-base font-semibold mb-3 flex-shrink-0">Conversation</h3>
          
          <div className="flex-1 border rounded-lg bg-white overflow-hidden flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {!interviewStarted || liveConversation.length === 0 ? (
                <div className="text-center text-gray-500 mt-4">
                  <p className="text-sm">Conversation will appear here</p>
                  <p className="text-xs">Click "Start Interview" to begin</p>
                </div>
              ) : (
                liveConversation.map((msg, index) => (
                  <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs px-3 py-2 rounded-lg shadow-sm ${
                      msg.sender === 'user' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      <div className="flex items-center gap-1 mb-1">
                        <div className="text-xs font-semibold">
                          {msg.sender === 'user' ? 'You' : discussion.interviewerName}
                        </div>
                        <div className="text-xs opacity-70">🎙️</div>
                      </div>
                      <div className="text-xs leading-relaxed">{msg.content}</div>
                      <div className="text-xs opacity-70 mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={conversationEndRef} />
            </div>
          </div>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default VoiceInterviewRoom;