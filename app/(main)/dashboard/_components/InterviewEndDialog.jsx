'use client'
import { useState, useEffect } from 'react'
import { getConversationHistory } from '@/services/firebase/chatService'
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

export default function InterviewEndDialog({ discussionRoomId, onClose }) {
  const [chatHistory, setChatHistory] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('conversation') // 'conversation' | 'feedback'

  useEffect(() => {
    const fetchData = async () => {
      if (!discussionRoomId) return
      try {
        const history = await getConversationHistory(discussionRoomId)
        setChatHistory(history)

        const roomRef = doc(db, 'discussionRooms', discussionRoomId)
        const roomSnap = await getDoc(roomRef)
        if (roomSnap.exists()) setFeedback(roomSnap.data().feedback || [])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [discussionRoomId])

  // Always reset tab on open
  useEffect(() => setActiveTab('conversation'), [discussionRoomId])

  return (
    // Raise z-index so the page header never overlaps
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white/95 w-full max-w-3xl sm:max-w-4xl rounded-2xl sm:rounded-3xl shadow-2xl ring-1 ring-black/5 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header with Tabs */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b bg-gradient-to-r from-slate-50 to-white">
          <h2 className="text-lg sm:text-2xl font-bold text-center mb-3">Interview Summary</h2>
          <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              aria-pressed={activeTab === 'conversation'}
              onClick={() => setActiveTab('conversation')}
              className={`w-full rounded-full px-3 py-2 text-sm sm:text-base font-medium transition
                ${activeTab === 'conversation'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-900'}`}
            >
              Conversations
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'feedback'}
              onClick={() => setActiveTab('feedback')}
              className={`w-full rounded-full px-3 py-2 text-sm sm:text-base font-medium transition
                ${activeTab === 'feedback'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-600 hover:text-slate-900'}`}
            >
              Feedback
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
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
                        <div className="mt-1 prose max-w-none text-sm sm:text-base">
                          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                            {String(chat.message || '')}
                          </ReactMarkdown>
                        </div>
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
                <div className="space-y-3">
                  {feedback.map((fb, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-xl border shadow-sm bg-white
                        ${fb.strength ? 'border-green-200' : 'border-red-200'}`}
                    >
                      <div className={`text-xs sm:text-sm font-bold mb-2
                        ${fb.strength ? 'text-green-600' : 'text-red-600'}`}>
                        {fb.strength ? 'Strength' : 'Area for Improvement'}
                      </div>
                      <div className="text-sm sm:text-base space-y-3">
                        <div>
                          <strong>Point:</strong>
                          <div className="mt-1 prose max-w-none text-sm">
                            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                              {String(fb.point || '')}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div>
                          <strong>Feedback:</strong>
                          <div className="mt-1 prose max-w-none text-sm">
                            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                              {String(fb.feedback || '')}
                            </ReactMarkdown>
                          </div>
                        </div>
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
        <div className="px-4 sm:px-6 py-3 border-t bg-white">
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