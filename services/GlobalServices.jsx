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
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

export const AIModel = async (topic, expertType, msg) => {
  let option;
  let prompt;
  
  try {
    console.log('🤖 AIModel called with:', { topic, expertType, msg });
    
    // Ensure ExpertsList is an array
    const expertsArray = Array.isArray(ExpertsList) ? ExpertsList : [];
    if (expertsArray.length === 0) {
      throw new Error('ExpertsList is empty or not properly imported');
    }
    
    // Find expert with fallback
    option = expertsArray.find((item) => item?.name === expertType) || expertsArray[0];
    if (!option) {
      throw new Error(`Expert not found: ${expertType}`);
    }
    
    if (!option.prompt) {
      throw new Error(`Expert "${option.name}" does not have a prompt property`);
    }
    
    console.log('✅ Selected expert:', option.name);
    
    // Local prompt variable (not global)
    prompt = option.prompt.replace("{user_topic}", topic || "general topics");
    
    // Use expert's model if available, else default
    const model = option.model || "qwen/qwen-2.5-72b-instruct:free";
    
    // Wrap API call with retry
    const completion = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: prompt,
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
    console.error('❌ AIModel Error:', error);
    
    // Fallback to Gemini if OpenRouter fails (e.g., rate limit)
    console.log('🔄 Falling back to Gemini...');
    try {
      // Reconstruct prompt if not set
      if (!prompt && option) {
        prompt = option.prompt.replace("{user_topic}", topic || "general topics");
      }
      const geminiPrompt = `${prompt}\n\nUser message: ${msg}`;
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





