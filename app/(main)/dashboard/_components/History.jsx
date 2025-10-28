'use client'

import React, { useEffect, useState, useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import { getUserDiscussions } from '@/services/firebase/discussionService'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const History = () => {
  const { userData } = useContext(UserContext);
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDiscussion, setSelectedDiscussion] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const fetchDiscussions = async () => {
      try {
        const result = await getUserDiscussions(userData.id, 10);
        if (result.success) {
          setDiscussions(result.data.items);  // Yeh change karo
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (userData?.id) fetchDiscussions();
  }, [userData]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'paused': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className='font-bold text-xl mb-4'>Recent Interviews</h2>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 border rounded-lg bg-gray-50 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2 className='font-bold text-xl mb-4'>Recent Interviews</h2>
        <div className="p-8 border-2 border-dashed border-gray-200 rounded-lg text-center">
          <div className="text-gray-500">
            <p className="text-lg">No interviews yet</p>
            <p className="text-sm mt-1">Start your first interview to build your history!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className='font-bold text-xl mb-4'>Recent Interviews</h2>
      {discussions.length === 0 ? (
        <div className="p-8 border-2 border-dashed border-gray-200 rounded-lg text-center">
          <div className="text-gray-500">
            <p className="text-lg">No interviews yet</p>
            <p className="text-sm mt-1">Start your first interview to build your history!</p>
          </div>
        </div>
      ) : (
        <div className='space-y-3'>
          {discussions.map((discussion) => (
            <div 
              key={discussion.id} 
              className='p-4 border rounded-lg bg-white hover:shadow-sm transition-all cursor-pointer group'
              onClick={() => router.push(`/dashboard/interview/${discussion.id}`)}
            >
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <h3 className='font-medium text-base mb-1 group-hover:text-blue-600 transition-colors'>
                    {discussion.practiceOption}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">{discussion.topic}</p>
                  
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{formatDate(discussion.createdAt)}</span>
                    
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDiscussion(discussion)
                    }}
                  >
                    View Details
                  </Button>
                  
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(discussion.status)}`}>
                    {discussion.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog for discussion details */}
      {selectedDiscussion && (
        <Dialog open={!!selectedDiscussion} onOpenChange={() => setSelectedDiscussion(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedDiscussion.practiceOption} - {selectedDiscussion.topic}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Conversation */}
              <div>
                <h3 className="font-semibold mb-3">Conversation</h3>
                {selectedDiscussion.conversation && selectedDiscussion.conversation.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedDiscussion.conversation.map((msg, idx) => (
                      <div key={idx} className={`p-3 rounded-lg ${
                        msg.role === 'user' ? 'bg-blue-50 ml-4' : 'bg-green-50 mr-4'
                      }`}>
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          {msg.role === 'user' ? '👤 You:' : '🤖 AI:'}
                        </div>
                        <div className="text-sm">{msg.content}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No conversation recorded</p>
                )}
              </div>
              
              {/* Feedback */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <span className="text-blue-600">💡</span> AI Feedback
                </h3>
                {selectedDiscussion.feedback && selectedDiscussion.feedback.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDiscussion.feedback.map((item, idx) => (
                      <div key={idx} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-400 rounded-lg shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 text-sm font-bold">{idx + 1}</span>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-blue-800 mb-1">{item.strength}</div>
                            <div className="text-sm text-gray-700 mb-2">{item.feedback}</div>
                            <div className="text-xs text-blue-600 font-medium">Points: {item.point}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No feedback available</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default History