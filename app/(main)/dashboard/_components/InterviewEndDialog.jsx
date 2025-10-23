'use client'
import { useState, useEffect } from 'react'
import { getChatHistory } from '@/services/firebase/chatService'

export default function InterviewEndDialog({ discussionRoomId, onClose }) {
  const [chatHistory, setChatHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchChatHistory = async () => {
      if (discussionRoomId) {
        const history = await getChatHistory(discussionRoomId)
        setChatHistory(history)
        setLoading(false)
      }
    }
    
    fetchChatHistory()
  }, [discussionRoomId])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Interview Completed!</h2>
        
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Conversation Summary:</h3>
          {loading ? (
            <p>Loading chat history...</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {chatHistory.map(chat => (
                <div key={chat.id} className={chat.sender === 'user' ? 'bg-blue-100' : 'bg-gray-100'}>
                  <strong>{chat.sender === 'user' ? '👤 You:' : '🤖 AI:'}</strong>
                  <span>{chat.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <button 
          onClick={onClose}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Close Interview
        </button>
      </div>
    </div>
  )
}