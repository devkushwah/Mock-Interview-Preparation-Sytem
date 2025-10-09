'use client'

import React, { useEffect, useState, useContext } from 'react'
import { UserContext } from '@/app/_context/UserContext'
import { getUserDiscussions } from '@/services/firebase/discussionService'
import { useRouter } from 'next/navigation'

const History = () => {
  const { userData } = useContext(UserContext);
  const [discussions, setDiscussions] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (userData?.id) {
      fetchDiscussions();
    }
  }, [userData]);

  const fetchDiscussions = async () => {
    try {
      setLoading(true);
      const userDiscussions = await getUserDiscussions(userData.id, 10);
      setDiscussions(userDiscussions);
    } catch (error) {
      console.error('Error fetching discussions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
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
        <h2 className='font-bold text-xl'>Your Previous Interviews</h2>
        <div className="space-y-3 mt-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 border rounded-lg bg-gray-50 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded mb-1"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className='font-bold text-xl'>Your Previous Interviews</h2>
      {discussions.length === 0 ? (
        <div className="mt-4 p-6 border-2 border-dashed border-gray-300 rounded-lg text-center">
          <div className="text-gray-500">
            <p className="text-lg font-medium">No interviews yet</p>
            <p className="text-sm mt-1">Start your first mock interview to see your history here!</p>
          </div>
        </div>
      ) : (
        <div className='space-y-3 mt-4'>
          {discussions.map((discussion) => (
            <div 
              key={discussion.id} 
              className='p-4 border rounded-lg bg-white hover:shadow-md transition-shadow cursor-pointer'
              onClick={() => router.push(`/dashboard/interview/${discussion.id}`)}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className='font-semibold text-lg'>{discussion.practiceOption}</h3>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(discussion.status)}`}>
                  {discussion.status}
                </span>
              </div>
              
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>Topic:</strong> {discussion.topic}</p>
                <p><strong>Interviewer:</strong> {discussion.interviewerName}</p>
                
                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-4">
                    {discussion.duration > 0 && (
                      <span><strong>Duration:</strong> {discussion.duration} min</span>
                    )}
                    {discussion.totalQuestions > 0 && (
                      <span><strong>Questions:</strong> {discussion.totalQuestions}</span>
                    )}
                    {discussion.score && (
                      <span><strong>Score:</strong> {discussion.score}%</span>
                    )}
                  </div>
                  
                  <p className='text-xs text-gray-500'>
                    {formatDate(discussion.createdAt)}
                  </p>
                </div>
              </div>

              {discussion.tags && discussion.tags.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {discussion.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                  {discussion.tags.length > 3 && (
                    <span className="text-xs text-gray-500">+{discussion.tags.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default History