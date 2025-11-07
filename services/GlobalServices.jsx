import React from 'react';
import OpenAI from 'openai';
import { ExpertsList } from '@/services/options';
import { callGemini } from '@/services/geminiService'; // Add this import for Gemini fallback

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.NEXT_PUBLIC_OPENAI_ROUTER_KEY,  // Note: Yeh backend mein move karo for security
  dangerouslyAllowBrowser: true,  // Remove when moving to backend
})

// Helper for exponential backoff retry
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      const status =
        error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        error?.cause?.response?.status

      if (status === 429) {
        error.rateLimit = true
        throw error
      }

      if (i === maxRetries - 1) throw error

      const delay = baseDelay * Math.pow(2, i) + Math.random() * 100
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
};

export const AIModel = async (topicOrContext, expertType, msg, modelOverride) => {
  let topic = '';
  let role = null;
  let experience = null;

  if (topicOrContext && typeof topicOrContext === 'object') {
    topic = topicOrContext.topic || '';
    role = topicOrContext.role || null;
    experience = topicOrContext.experience || null;
  } else {
    topic = topicOrContext || '';
  }

  let option;
  let promptTemplate = '';
  let resolvedPrompt = '';

  try {
    console.log('🤖 AIModel called with:', { topic, role, experience, expertType, msg });
    
    const expertsArray = Array.isArray(ExpertsList) ? ExpertsList : [];
    if (expertsArray.length === 0) {
      throw new Error('ExpertsList is empty or not properly imported');
    }
    
    option = expertsArray.find((item) => item?.name === expertType) || expertsArray[0];
    if (!option) {
      throw new Error(`Expert not found: ${expertType}`);
    }
    
    if (!option.prompt) {
      throw new Error(`Expert "${option.name}" does not have a prompt property`);
    }
    
    console.log('✅ Selected expert:', option.name);
    
    promptTemplate = option.prompt || '';
    resolvedPrompt = promptTemplate
      .replace(/{user_topic}/gi, topic || 'general interview topics')
      .replace(/{user_role}/gi, role || 'the target role')
      .replace(/{user_experience}/gi, experience || 'the candidate\'s experience level');
    
    const model = modelOverride || option.model || "qwen/qwen-2.5-72b-instruct:free";
    
    const completion = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: resolvedPrompt,
          },
          {
            role: "user", 
            content: msg,
          },
        ],
      });
    });
    
    console.log('✅ AI Response received:', completion.choices[0].message);
    
    return {
      success: true,
      response: completion.choices[0].message.content
    };
    
  } catch (error) {
    const isRateLimited =
      error?.rateLimit ||
      error?.status === 429 ||
      error?.statusCode === 429 ||
      error?.response?.status === 429

    if (isRateLimited) {
      console.warn('⚠️ OpenRouter rate limit hit; switching to Gemini fallback once.')
    } else {
      console.error('❌ AIModel Error:', error)
    }

    try {
      if (!resolvedPrompt && promptTemplate) {
        resolvedPrompt = promptTemplate
          .replace(/{user_topic}/gi, topic || 'general interview topics')
          .replace(/{user_role}/gi, role || 'the target role')
          .replace(/{user_experience}/gi, experience || 'the candidate\'s experience level');
      }
      const geminiPrompt = `${resolvedPrompt}\n\nUser message: ${msg}`;
      const geminiResponse = await callGemini(geminiPrompt);
      if (geminiResponse) {
        console.log('✅ Gemini fallback success');
        return {
          success: true,
          response: geminiResponse
        };
      } else {
        throw new Error('Gemini fallback failed');
      }
    } catch (geminiError) {
      console.error('❌ Gemini fallback failed:', geminiError);
      return {
        success: false,
        error: 'Both OpenRouter and Gemini failed',
        response: "I'm sorry, I'm having trouble responding right now. Please try again."
      };
    }
  }
}





