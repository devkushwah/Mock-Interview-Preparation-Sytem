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
                    {discussion.duration > 0 && (
                      <span>{discussion.duration} min</span>
                    )}
                    {discussion.conversation?.length > 0 && (
                      <span>{discussion.conversation.length} exchanges</span>
                    )} 
                  </div>
                </div>
                
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(discussion.status)}`}>
                  {discussion.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default History