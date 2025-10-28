# 🧠 AIInterviewPro – AI-powered Mock Interview & English Coach Platform

AIInterviewPro is an **AI-driven mock interview and English practice platform** that helps users prepare for technical and behavioral interviews through **real-time AI simulations**, **personalized feedback**, and **voice-based interactions**.

---

## 🚀 Features

### 🎯 **Interview Modes**
- **Interview Mode:** Simulates a real interview environment with AI asking questions and giving instant feedback.
- **English Practice:** Speak with an AI English coach that corrects your grammar, fluency, and pronunciation.
- **Topic/Question Practice:** Focused practice sessions on specific topics or question sets.

### 💬 **Interactive Conversations**
- Integrated **Speech-to-Text (STT)** and **Text-to-Speech (TTS)** using **Deepgram** for seamless voice-based communication.
- Full **conversation transcripts** are saved for review after each session.

### 📊 **Feedback & History**
- Receive **detailed performance feedback** after each interview.
- Access your **complete interview history** anytime to analyze growth and improvement.

### 💳 **Credit-Based Usage**
- Users receive credits on signup, which are consumed during interactions.
- Managed using **Firebase Authentication** and **Firestore** for real-time tracking.

### 💻 **Responsive Design**
- Built with **Next.js**, **Tailwind CSS**, and **Shadcn UI** for a fast, elegant, and consistent experience across all devices.

---

## 🧩 Tech Stack

| Category | Technologies Used |
|-----------|-------------------|
| **Frontend** | Next.js, JavaScript, Tailwind CSS, Shadcn UI |
| **Backend / Database** | Firebase (Auth + Firestore), Stack Auth |
| **AI / NLP** | Gemini API (via OpenRouter) |
| **Speech Processing** | Deepgram (STT/TTS) |
| **Real-Time Communication** | WebSocket |
| **State Management** | React Hooks, Context API |
| **Version Control** | Git, GitHub |

---

## ⚙️ Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/devkushwah/Mock-Interview-Preparation-Sytem.git
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file and add:

   ```bash
# Stack Auth (for authentication)
NEXT_PUBLIC_STACK_PROJECT_ID=your_stack_project_id
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your_stack_publishable_client_key
STACK_SECRET_SERVER_KEY=your_stack_secret_server_key

# Firebase (Auth + Firestore + Database)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Speech Processing
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_key
DEEPGRAM_API_KEY=your_deepgram_key

# AI / NLP
NEXT_PUBLIC_OPENAI_ROUTER_KEY=your_openrouter_key
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_key
NEXT_PUBLIC_GEMINI_MODEL=gemini-1.5-pro
   ```

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open in browser**

   ```
   http://localhost:3000
   ```

---

## 🧠 How It Works

1. User selects a mode (Interview / English Practice / Topic Practice).
2. App connects with AI backend (Gemini API via OpenRouter).
3. Voice input processed via Deepgram STT → AI generates response → Speech output via TTS.
4. Full conversation + feedback stored in Firebase.
5. User can revisit and analyze past sessions anytime.

---



## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

## 🤝 Contributing

Pull requests are welcome!
For major changes, please open an issue first to discuss what you’d like to change.

---

## 👤 Author

**Dev Kushwah**
📧 [devkushwah880@gmail.com](mailto:devkushwah880@gmail.com)


---

⭐ If you like this project, don’t forget to **star** the repo!


