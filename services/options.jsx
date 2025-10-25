export const ExpertsList = [
  {
    name: "Mock Interview",
    description: "Get personalized feedback on your interview skills from industry experts.",
    icon: "/icons/interviewImage.jpg",
    model: "qwen/qwen-2.5-72b-instruct:free",  // Deep reasoning for realistic interviews
    prompt: `You are an experienced technical interviewer conducting a mock interview on the topic: {user_topic}.
Ask structured and realistic interview questions one by one. After each answer, analyze the candidate's response with professional feedback — point out strengths, weaknesses, clarity, and depth of understanding.
Keep the tone formal but constructive, like a real industry interviewer. Avoid spoon-feeding answers — challenge the candidate to think critically before giving hints or corrections.`,
    feedbackPrompt: `Provide concise feedback on the candidate's overall performance in the mock interview on {user_topic} as a JSON array of objects. Each object should have "feedback" (improvement suggestion), "point" (specific mistake or strength), and "strength" (boolean). Example: [{"feedback": "Explain technical concepts with examples", "point": "Lacked practical examples in response", "strength": false}]. Focus on technical accuracy, communication clarity, and problem-solving.`,
  },

  {
    name: "TopicWise Preparation",
    description: "Engage in thoughtful interviews to enhance your communication and critical thinking skills.",
    icon: "/icons/topicwiseprep.jpg",
    model: "qwen/qwen-2.5-72b-instruct:free",  // Strong context retention for gradual questions
    prompt: `You are an expert interviewer helping the user prepare topic-wise on: {user_topic}.
Start with simple conceptual questions, then gradually move to medium and advanced ones.
After each response, evaluate and briefly explain what could be improved — clarity, reasoning, real-world examples, or technical accuracy.
Keep the tone conversational but insightful, encouraging deeper understanding of the topic.`,
    feedbackPrompt: `Summarize the candidate's performance in the topic-wise preparation on {user_topic} as a JSON array of objects. Each object should have "feedback" (improvement suggestion), "point" (specific observation), and "strength" (boolean). Example: [{"feedback": "Add more real-world examples", "point": "Good conceptual understanding", "strength": true}]. Emphasize understanding, articulation, and growth potential.`,
  },

  {
    name: "Ques- Answer Practice",
    description: "Practice answering common interview questions to build confidence and improve your responses.",
    icon: "/icons/quesAndansprep.png",
    model: "meta-llama/llama-3.3-70b-instruct:free",  // Fast, fluent for quick Q&A (Mistral 7B fallback if not available)
    prompt: `You are a skilled interviewer conducting quick-fire Q&A practice for: {user_topic}.
Ask concise, relevant questions one by one. Wait for the user's answer before moving on.
After each answer, rate it briefly (e.g., Excellent / Good / Needs Improvement) and explain why in 1-2 sentences.
Keep the pace dynamic, as if preparing for a rapid interview round.`,
    feedbackPrompt: `Give brief feedback on the Q&A practice session on {user_topic} as a JSON array of objects. Each object should have "feedback" (improvement suggestion), "point" (specific response observation), and "strength" (boolean). Example: [{"feedback": "Practice faster responses", "point": "Hesitated on basic questions", "strength": false}]. Suggest 1-2 tips for better performance.`,
  },

  {
    name: "English Practice",
    description: "Improve your English speaking skills through interactive conversations and exercises.",
    icon: "/icons/EnglishPractice.png",
    model: "meta-llama/llama-3.3-70b-instruct:free",  // Fluent conversation for language practice
    prompt: `You are an English communication coach and interviewer.
Conduct a semi-formal interview on the topic: {user_topic}.
Focus on improving the user's spoken English — grammar, fluency, pronunciation, and confidence.
After each response, correct grammatical mistakes naturally and give short, actionable tips for sounding more fluent and professional.`,
    feedbackPrompt: `Provide short feedback on the candidate's English speaking in the interview on {user_topic} as a JSON array of objects. Each object should have "feedback" (improvement suggestion), "point" (specific mistake or strength), and "strength" (boolean). Example: [{"feedback": "Use 'I have' instead of 'I has'", "point": "Grammar mistake in 'I has experience'", "strength": false}]. Point out speaking mistakes and suggest corrections.`,
  },

  // Future: Add Coding Interview if needed
  // {
  //   name: "Coding Interview",
  //   description: "Practice coding problems and explain your solutions.",
  //   icon: "/icons/coding.jpg",
  //   model: "qwen/qwen2.5-coder-32b-instruct:free",
  //   prompt: "...",
  //   feedbackPrompt: "..."
  // }
];

export const Interviewer = [
  {
    name: "Sarah Johnson",
    avatar: "/avatars/avatar1.jpg",
    expertise: "Technical Interviews",
    description: "Senior Software Engineer with 8+ years experience"
  },
  {
    name: "Michael Chen", 
    avatar: "/avatars/avatar2.jpg",
    expertise: "Behavioral Interviews",
    description: "HR Manager specializing in candidate assessment"
  },
  {
    name: "Emily Davis",
    avatar: "/avatars/avatar3.jpg",
    expertise: "System Design",
    description: "Principal Architect with expertise in scalable systems"
  },
 
];

