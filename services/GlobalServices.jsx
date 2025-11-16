import React from 'react';
import OpenAI from 'openai';
import { ExpertsList } from '@/services/options';
import { callGemini } from '@/services/geminiService'; 

// Remove the OpenRouter client setup since we're replacing Qwen with Groq
// const openai = new OpenAI({
//   baseURL: "https://openrouter.ai/api/v1",
//   apiKey: process.env.NEXT_PUBLIC_OPENAI_ROUTER_KEY,  // Note: Yeh backend mein move karo for security
//   dangerouslyAllowBrowser: true,  // Remove when moving to backend
// })

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
    // debug logs removed

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
    // - pro => Groq (fallback Gemini on failure)
    if (tier !== 'pro') {
      console.log('🔎 Model selection: tier != pro → using Gemini (regular).'); // log model choice
      const geminiResponse = await callGemini(combinedPrompt);
      if (!geminiResponse) throw new Error('Gemini returned empty response');
      console.log('✅ Gemini response received (regular).');
      return { success: true, response: geminiResponse };
    }

    // Pro plan => Always Groq (ignore option.model to enforce policy)
    // Check for API key before creating client
    if (!process.env.GROQ_KEY) {
      // GROQ key not available in this environment — fallback to Gemini automatically
      // (keeps pro behavior working when GROQ_KEY isn't set)
      const geminiResp = await callGemini(combinedPrompt);
      if (!geminiResp) {
        throw new Error('GROQ_KEY missing and Gemini fallback returned empty response');
      }
      return { success: true, response: geminiResp, fallback: 'gemini-no-groq-key' };
    }
    // Create a new OpenAI client for Groq
    const groqClient = new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_KEY,    });
    // Model selection precedence: explicit override > expert config > default
    let model = modelOverride || option?.model || "groq/compound-mini";
    if (option?.model && !String(option.model).startsWith('groq/')) {
      console.warn(`⚠️ Expert model "${option.model}" may not be Groq-compatible. Falling back to "${model}".`);
      if (!String(model).startsWith('groq/')) model = modelOverride || "groq/compound-mini";
    }
    console.log(`🔎 Model selection: tier=pro → attempting Groq model "${model}".`);
    const completion = await retryWithBackoff(async () => {
      return await groqClient.chat.completions.create({
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
      console.warn('⚠️ Groq rate limit; trying Gemini fallback.')
    } else {
      console.error('❌ AIModel Error (Groq attempt):', error)
    }

    // Fallback: try Gemini once (keeps regular=Gemini rule; also helps pro on failure)
    try {
      console.log('🔁 Falling back to Gemini for response (fallback from Groq).');
      const fallbackPrompt = `${resolvedPrompt || ''}\n\nUser message: ${msg}`;
      const geminiResponse = await callGemini(fallbackPrompt);
      if (geminiResponse) {
        console.log('✅ Gemini fallback success.');
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





