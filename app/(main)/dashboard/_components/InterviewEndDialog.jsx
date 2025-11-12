'use client'
import { useState, useEffect } from 'react'
import { getConversationHistory } from '@/services/firebase/chatService'
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'

export default function InterviewEndDialog({ discussionRoomId, onClose }) {
  const [chatHistory, setChatHistory] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('conversation') // 'conversation' | 'feedback'

  useEffect(() => {
    const fetchData = async () => {
      if (discussionRoomId) {
        // Fetch chat history
        const history = await getConversationHistory(discussionRoomId)
        setChatHistory(history)

        // Fetch feedback from discussion room
        const roomRef = doc(db, 'discussionRooms', discussionRoomId)
        const roomSnap = await getDoc(roomRef)
        if (roomSnap.exists()) {
          const roomData = roomSnap.data()
          setFeedback(roomData.feedback || [])
        }

        setLoading(false)
      }
    }
    
    fetchData()
  }, [discussionRoomId])

  // Reset to conversation tab every time dialog opens for a new room
  useEffect(() => {
    setActiveTab('conversation')
  }, [discussionRoomId])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-3xl sm:max-w-4xl rounded-2xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header with Tabs */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b bg-white shrink-0">
          <h2 className="text-lg sm:text-2xl font-bold text-center mb-3">Interview Summary</h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              aria-pressed={activeTab === 'conversation'}
              onClick={() => setActiveTab('conversation')}
              className={`w-full rounded-full px-3 py-2 text-sm sm:text-base font-semibold transition
                ${activeTab === 'conversation'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Conversations
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'feedback'}
              onClick={() => setActiveTab('feedback')}
              className={`w-full rounded-full px-3 py-2 text-sm sm:text-base font-semibold transition
                ${activeTab === 'feedback'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Feedback
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 overscroll-contain">
          {activeTab === 'conversation' && (
            <div>
              <h3 className="text-sm sm:text-lg font-semibold mb-3">Conversation</h3>
              {loading ? (
                <p className="text-sm text-slate-600">Loading chat history...</p>
              ) : (
                <div className="space-y-2 border rounded-xl p-3 bg-slate-50">
                  {chatHistory.length ? (
                    chatHistory.map(chat => (
                      <div
                        key={chat.id}
                        className={`p-2 rounded text-sm sm:text-base
                          ${chat.sender === 'user'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'}`}
                      >
                        <strong>{chat.sender === 'user' ? 'You: ' : 'AI: '}</strong>
                        {chat.message}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No conversation found.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'feedback' && (
            <div>
              <h3 className="text-sm sm:text-lg font-semibold mb-3">AI Feedback & Improvements</h3>
              {loading ? (
                <p className="text-sm text-slate-600">Loading feedback...</p>
              ) : feedback.length > 0 ? (
                <div className="space-y-3 border rounded-xl p-3 bg-yellow-50">
                  {feedback.map((fb, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded border
                        ${fb.strength ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                    >
                      <div className="mb-2">
                        <span className={`text-xs sm:text-sm font-bold
                          ${fb.strength ? 'text-green-600' : 'text-red-600'}`}>
                          {fb.strength ? '✅ Strength' : '⚠️ Area for Improvement'}
                        </span>
                      </div>
                      <div className="text-sm sm:text-base">
                        <div className="mb-1"><strong>Point:</strong> {fb.point}</div>
                        <div><strong>Feedback:</strong> {fb.feedback}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No feedback available yet. It will be generated shortly.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t bg-white shrink-0">
          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="bg-blue-600 text-white px-5 sm:px-6 py-2 rounded-full text-sm sm:text-base hover:bg-blue-700 transition"
            >
              Close Interview
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}