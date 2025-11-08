'use client'

import React, { useState, useContext, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { UserContext } from '@/app/_context/UserContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebaseConfig'
import { doc, getDoc } from 'firebase/firestore';

const UserInputDialog = ({ children, interviewType, onSessionStarted }) => {
  const { userData } = useContext(UserContext);
  const practiceName = interviewType?.name || '';
  const isEnglishPractice = practiceName === 'English Practice';
  const requiresDetails = useMemo(
    () => practiceName === 'Technical Interview' || practiceName === 'Mixed Interview',
    [practiceName]
  );
  const defaultTopic = isEnglishPractice ? 'English Practice' : '';
  const [topic, setTopic] = useState(defaultTopic);
  const [role, setRole] = useState('');
  const [experience, setExperience] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [tier, setTier] = useState('regular') // plan state
  const router = useRouter();

  const resetForm = () => {
    setTopic(defaultTopic);
    setRole('');
    setExperience('');
  };

  const handleOpenChange = (open) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleStart = async () => {
    if (isCreating) return
    setIsCreating(true)
    try {
      const payload = {
        userId: userData?.id,
        practiceOption: practiceName,
        topic: topic || 'General',
        role,
        experience,
        tier,
        interviewerName: practiceName,
        tags: extractTags(topic)
      }
      const { createDiscussionRoom } = await import('@/services/firebase/discussionService')
      const res = await createDiscussionRoom(payload)
      if (res.success) {
        const stats = res.data.freeStats
        console.log(`[FREE UI] Session started | doc=${res.data.id} regularLeft(before->after) ${stats.before.leftRegular} -> ${stats.after.leftRegular} | proLeft ${stats.before.leftPro} -> ${stats.after.leftPro}`)
        // Pass AFTER counts to parent
        onSessionStarted && onSessionStarted(stats.after)
        router.push(`/dashboard/interview/${res.data.id}`)
        resetForm()
        setIsOpen(false)
      } else {
        console.warn('Failed to create discussion room:', res.error)
      }
    } catch (e) {
      console.error('start error:', e)
    } finally {
      setIsCreating(false)
    }
  };

  // Extract tags from topic text
  const extractTags = (topicText) => {
    const commonTech = ['react', 'javascript', 'python', 'java', 'node', 'sql', 'mongodb', 'express', 'nextjs'];
    const words = topicText.toLowerCase().split(' ');
    return commonTech.filter(tech => 
      words.some(word => word.includes(tech) || tech.includes(word))
    );
  };

  const actionSummary = useMemo(() => {
    if (requiresDetails) {
      return [
        'Define a focused interview topic.',
        'Tell us the role you’re preparing for.',
        'Share your current experience level.'
      ]
    }

    return [
      'Instant practice session with AI coach.',
      'Adaptive prompts tailored to your responses.',
      'Actionable feedback at the end of the session.'
    ]
  }, [requiresDetails])

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild onClick={() => setIsOpen(true)}>{children}</DialogTrigger>
      {/* Smaller width + scrollable height */}
      <DialogContent className="w-[92vw] max-w-md max-h-[70vh] overflow-y-auto rounded-2xl p-5 sm:p-6">
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600 px-3 py-2.5 sm:px-4 sm:py-3.5 text-white shadow-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {practiceName || 'Interview'}
          </span>
          <h2 className="mt-1.5 text-lg font-semibold">
            {requiresDetails ? 'Customize your mock interview' : 'Ready when you are'}
          </h2>
          <p className="mt-1 text-[11px] text-blue-100">
            {requiresDetails
              ? 'Help us craft relevant questions and realistic scenarios by filling in a few details.'
              : 'Kick off a smart practice session instantly—no extra setup needed.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-background shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2 sm:px-3.5 sm:py-2.5">
            <DialogHeader className="space-y-0.5 text-left">
              <DialogTitle className="text-sm font-semibold text-slate-900">
                Start {practiceName || 'Interview'} Session
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500">
                {requiresDetails
                  ? 'Share your target topic, role, and experience so we can tailor the interview.'
                  : 'Jump right in—just press start to begin your AI-powered practice session.'}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-3 py-3 space-y-2.5 sm:px-3.5">
            <ul className="grid gap-1.5 rounded-lg bg-slate-50/70 p-2 text-[11px] text-slate-600 sm:p-2.5">
              {actionSummary.map((item) => (
                <li key={item} className="flex items-start gap-1.5">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {requiresDetails && (
              <div className="space-y-2.5">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-600">Focus topic</span>
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., System design for real-time analytics platforms"
                    className="w-full resize-none rounded-lg border border-slate-200 bg-background p-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    rows={2}
                    required
                  />
                </label>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-600">Target role</span>
                    <input
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g., Frontend Engineer"
                      className="w-full rounded-lg border border-slate-200 bg-background p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-slate-600">Experience</span>
                    <input
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      placeholder="e.g., 3 years"
                      className="w-full rounded-lg border border-slate-200 bg-background p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      required
                    />
                  </label>
                </div>
              </div>
            )}

            {!requiresDetails && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-600">
                You’re all set for {practiceName || 'this interview'}—hit Start Interview whenever you’re ready.
              </div>
            )}
          </div>
        </div>

        {/* Plan selector – compact, no model names */}
        <div className="space-y-2.5">
          <span className="mb-1 block text-[11px] font-medium text-slate-600">Plan</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTier('regular')}
              className={`rounded-xl border px-3 py-3 text-left transition
                ${tier === 'regular'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Regular</span>
                {tier === 'regular' && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
              </div>
              <div className="mt-1 text-xs text-slate-500">10 free/day</div>
            </button>

            <button
              type="button"
              onClick={() => setTier('pro')}
              className={`rounded-xl border px-3 py-3 text-left transition
                ${tier === 'pro'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Pro</span>
                {tier === 'pro' && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
              </div>
              <div className="mt-1 text-xs text-slate-500">1 free/day</div>
            </button>
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={
            isCreating ||
            (requiresDetails && (!topic || !role || !experience))
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {isCreating ? 'Starting...' : 'Start Interview'}
        </button>
      </DialogContent>
    </Dialog>
  )
}

export default UserInputDialog