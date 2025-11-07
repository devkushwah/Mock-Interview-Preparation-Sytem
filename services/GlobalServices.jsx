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
  let tier = null; // regular | pro

  if (topicOrContext && typeof topicOrContext === 'object') {
    topic = topicOrContext.topic || '';
    role = topicOrContext.role || null;
    experience = topicOrContext.experience || null;
    tier = (topicOrContext.tier || topicOrContext.plan || topicOrContext?.discussion?.tier || 'regular').toLowerCase();
  } else {
    topic = topicOrContext || '';
    tier = 'regular';
  }

  let option;
  let promptTemplate = '';
  let resolvedPrompt = '';

  try {
    console.log('🤖 AIModel called with:', { topic, role, experience, expertType, msg, tier });

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

    promptTemplate = option.prompt || '';
    resolvedPrompt = promptTemplate
      .replace(/{user_topic}/gi, topic || 'general interview topics')
      .replace(/{user_role}/gi, role || 'the target role')
      .replace(/{user_experience}/gi, experience || 'the candidate\'s experience level');

    const combinedPrompt = `${resolvedPrompt}\n\nUser message: ${msg}`;

    // Force model by tier:
    // - regular => Gemini only
    // - pro => Qwen via OpenRouter (fallback Gemini on failure)
    if (tier !== 'pro') {
      const geminiResponse = await callGemini(combinedPrompt);
      if (!geminiResponse) throw new Error('Gemini returned empty response');
      return { success: true, response: geminiResponse };
    }

    // Pro plan -> Always Qwen (ignore option.model to enforce policy)
    const model = modelOverride || "qwen/qwen-2.5-72b-instruct:free";
    const completion = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: resolvedPrompt },
          { role: "user", content: msg },
        ],
      });
    });

    return {
      success: true,
      response: completion.choices[0].message.content
    };

  } catch (error) {
    const isRateLimited =
      error?.rateLimit ||
      error?.status === 429 ||
      error?.statusCode === 429 ||
      error?.response?.status === 429;

    if (isRateLimited) {
      console.warn('⚠️ OpenRouter rate limit; trying Gemini fallback.')
    } else {
      console.error('❌ AIModel Error:', error)
    }

    // Fallback: try Gemini once (keeps regular=Gemini rule; also helps pro on failure)
    try {
      const fallbackPrompt = `${resolvedPrompt || ''}\n\nUser message: ${msg}`;
      const geminiResponse = await callGemini(fallbackPrompt);
      if (geminiResponse) {
        return { success: true, response: geminiResponse };
      }
      throw new Error('Gemini fallback failed');
    } catch (geminiError) {
      console.error('❌ Gemini fallback failed:', geminiError);
      return {
        success: false,
        error: 'Both model calls failed',
        response: "I'm having trouble responding right now. Please try again."
      };
    }
  }
}





