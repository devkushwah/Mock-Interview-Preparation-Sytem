import React from 'react';
import OpenAI from 'openai';
import { ExpertsList } from '@/services/options';

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.NEXT_PUBLIC_OPENAI_ROUTER_KEY,
  dangerouslyAllowBrowser: true,
})

let PROMPT = ''; // Declare PROMPT variable

export const AIModel = async (topic, expertType, msg) => {
  try {
    console.log('🤖 AIModel called with:', { topic, expertType, msg });
    console.log('📋 ExpertsList type:', typeof ExpertsList, ExpertsList);
    
    // Ensure ExpertsList is an array and handle edge cases
    const expertsArray = Array.isArray(ExpertsList) ? ExpertsList : [];
    
    if (expertsArray.length === 0) {
      throw new Error('ExpertsList is empty or not properly imported');
    }
    
    // Find the expert by name with fallback to first expert
    const option = expertsArray.find((item) => item?.name === expertType) || expertsArray[0];
    
    if (!option) {
      throw new Error(`Expert not found: ${expertType}`);
    }
    
    if (!option.prompt) {
      throw new Error(`Expert "${option.name}" does not have a prompt property`);
    }
    
    console.log('✅ Selected expert:', option.name);
    
    // Replace topic placeholder in prompt
    PROMPT = option.prompt.replace("{user_topic}", topic || "general topics");
    
    const completion = await openai.chat.completions.create({
      model: "qwen/qwen-2.5-72b-instruct:free",
      messages: [
        {
          role: "system",
          content: PROMPT,
        },
        {
          role: "user", 
          content: msg,
        },
      ],
    });
    
    console.log('✅ AI Response received:', completion.choices[0].message);

    // Return success response following system patterns
    return {
      success: true,
      response: completion.choices[0].message.content
    };
    
  } catch (error) {
    console.error('❌ AIModel Error:', error);
    
    // Return error response following system patterns
    return {
      success: false,
      error: error.message,
      response: "I'm sorry, I'm having trouble responding right now. Please try again."
    };
  }
}





