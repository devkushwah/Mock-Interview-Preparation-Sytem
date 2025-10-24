'use client'
import { useState, useEffect } from 'react'
import { getConversationHistory } from '@/services/firebase/chatService'
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'

export default function InterviewEndDialog({ discussionRoomId, onClose }) {
  const [chatHistory, setChatHistory] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg max-w-4xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 text-center">🎉 Interview Completed!</h2>
        
        {/* Conversation Summary */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">📝 Conversation Summary:</h3>
          {loading ? (
            <p>Loading chat history...</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3 bg-gray-50">
              {chatHistory.map(chat => (
                <div key={chat.id} className={`p-2 rounded ${chat.sender === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  <strong>{chat.sender === 'user' ? '👤 You:' : '🤖 AI:'}</strong> {chat.message}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Feedback Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">💡 AI Feedback & Improvements:</h3>
          {loading ? (
            <p>Loading feedback...</p>
          ) : feedback.length > 0 ? (
            <div className="space-y-4 border rounded-lg p-3 bg-yellow-50">
              {feedback.map((fb, index) => (
                <div key={index} className={`border-b pb-4 last:border-b-0 p-3 rounded ${fb.strength ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-bold ${fb.strength ? 'text-green-600' : 'text-red-600'}`}>
                      {fb.strength ? '✅ Strength' : '⚠️ Area for Improvement'}
                    </span>
                  </div>
                  <div className="mb-2">
                    <strong>Point:</strong> {fb.point}
                  </div>
                  <div>
                    <strong>Feedback:</strong> {fb.feedback}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No feedback available yet. It will be generated shortly.</p>
          )}
        </div>
        
        <div className="flex justify-center">
          <button 
            onClick={onClose}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Close Interview
          </button>
        </div>
      </div>
    </div>
  )
}