'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserButton } from '@stackframe/stack'
import { Github, Linkedin, User } from 'lucide-react' // added icons

const Page = () => {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col text-gray-800 scroll-smooth">
      {/* Navbar */}
      <header className="w-full py-4 px-6 md:px-12 bg-gray-100 shadow-md flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">AI Mock Interview</h1>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-6 text-gray-700 font-medium">
          <a href="#features" className="hover:text-indigo-600">Features</a>
          <a href="#testimonials" className="hover:text-indigo-600">Testimonials</a>
          <a href="#contact" className="hover:text-indigo-600">Contact</a>
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition"
          >
            Get Started
          </button>
          <UserButton />

          {/* Hamburger Menu (Mobile) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden ml-2 focus:outline-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Nav */}
        {menuOpen && (
          <div className="absolute top-full left-0 w-full bg-white shadow-md flex flex-col items-center py-4 space-y-4 md:hidden z-40">
            <a
              href="#features"
              onClick={() => setMenuOpen(false)}
              className="text-gray-700 font-medium hover:text-indigo-600"
            >
              Features
            </a>
            <a
              href="#testimonials"
              onClick={() => setMenuOpen(false)}
              className="text-gray-700 font-medium hover:text-indigo-600"
            >
              Testimonials
            </a>
            <a
              href="#contact"
              onClick={() => setMenuOpen(false)}
              className="text-gray-700 font-medium hover:text-indigo-600"
            >
              Contact
            </a>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center py-20 px-6 md:px-0 bg-gradient-to-r from-gray-900 to-gray-400 text-white">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">Ace Your Next Interview</h2>
        <p className="text-lg text-gray-200 mb-8 max-w-2xl">
          Practice with AI-powered mock interviews and get personalized feedback
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-white text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition"
          >
            Get Started
          </button>
          <a
            href="#features"
            className="border border-white px-6 py-3 rounded-lg font-semibold text-white hover:bg-white hover:text-gray-900 transition"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 bg-white px-6 md:px-0 scroll-mt-24">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-gray-800">Features</h2>
          <p className="mt-4 text-lg text-gray-800">
            Our AI Mock Interview platform offers a range of powerful features:
          </p>

          <div className="flex flex-wrap justify-center mt-10">
            {/* Card 1 */}
            <div className="w-full md:w-1/3 px-4 py-6">
              <div className="bg-blue-50 rounded-lg p-8 shadow-md hover:shadow-lg transition">
                <h3 className="text-2xl font-semibold text-gray-800 mb-2">
                  AI Mock Interviews
                </h3>
                <p className="text-gray-600">
                  Experience realistic interview scenarios with our advanced AI.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="w-full md:w-1/3 px-4 py-6">
              <div className="bg-blue-50 rounded-lg p-8 shadow-md hover:shadow-lg transition">
                <h3 className="text-2xl font-semibold text-gray-800 mb-2">
                  Instant Feedback
                </h3>
                <p className="text-gray-600">
                  Get instant, personalized feedback to improve your performance.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="w-full md:w-1/3 px-4 py-6">
              <div className="bg-blue-50 rounded-lg p-8 shadow-md hover:shadow-lg transition">
                <h3 className="text-2xl font-semibold text-gray-800 mb-2">
                  Comprehensive Reports
                </h3>
                <p className="text-gray-600">
                  Receive detailed reports highlighting your strengths and weaknesses.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 px-6 bg-gray-50 text-center scroll-mt-24">
        <h3 className="text-3xl font-bold mb-10 text-gray-800">What Our Users Say</h3>
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="bg-white p-8 rounded-lg shadow-md">
            <p className="text-gray-700 italic mb-4">
              "The AI mock interviews were incredibly helpful. I felt much more confident going into my real interview."
            </p>
            <p className="text-blue-600 font-semibold">– Alex Johnson</p>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-md">
            <p className="text-gray-700 italic mb-4">
              "The feedback was spot on and helped me improve my answers. Highly recommend this service!"
            </p>
            <p className="text-blue-600 font-semibold">– Sarah Williams</p>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-6 bg-white text-center scroll-mt-24">
        <h3 className="text-3xl font-bold mb-8 text-gray-800">Get In Touch</h3>
        <p className="text-gray-600 mb-10">
          Have any questions? Reach out to us and we'll get back to you as soon as possible.
        </p>
        <form className="max-w-md mx-auto space-y-4">
          <input
            type="text"
            placeholder="Your Name"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="email"
            placeholder="Your Email"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            rows="4"
            placeholder="Your Message"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          ></textarea>
          <button
            type="submit"
            className="bg-black text-white px-6 py-3 w-full rounded-md font-semibold hover:bg-gray-800 transition"
          >
            Send Message
          </button>
        </form>

        {/* Social / Profiles - colorful larger icons */}
        <div className="mt-8 flex justify-center gap-6">
          <a
            href="https://github.com/your-username"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="transform transition-transform hover:scale-110"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#181717]">
              <Github className="w-7 h-7 text-white" />
            </div>
          </a>

          <a
            href="https://www.linkedin.com/in/your-username"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="transform transition-transform hover:scale-110"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#0A66C2]">
              <Linkedin className="w-7 h-7 text-white" />
            </div>
          </a>

          <a
            href="https://your-portfolio.example.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Profile"
            className="transform transition-transform hover:scale-110"
          >
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#6B46C1]">
              <User className="w-7 h-7 text-white" />
            </div>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-gray-300 py-6 text-center">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-4 px-6">
          <p className="text-sm">© 2025 AI Mock Interview. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default Page
