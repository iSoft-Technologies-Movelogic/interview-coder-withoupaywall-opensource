# CodeInterviewAssist - Enhanced with Live Interview Mode

> ## ⚠️ IMPORTANT NOTICE TO THE COMMUNITY ⚠️
> 
> **This is a free, open-source initiative - NOT a full-service product!**
> 
> There are numerous paid interview preparation tools charging hundreds of dollars for comprehensive features like live audio capture, automated answer generation, and more. This project is fundamentally different:
> 
> - This is a **small, non-profit, community-driven project** with zero financial incentive behind it
> - The entire codebase is freely available for anyone to use, modify, or extend
> - Want features like voice support? You're welcome to integrate tools like OpenAI's Whisper or other APIs
> - New features should come through **community contributions** - it's unreasonable to expect a single maintainer to implement premium features for free
> - The maintainer receives no portfolio benefit, monetary compensation, or recognition for this work
> 
> **Before submitting feature requests or expecting personalized support, please understand this project exists purely as a community resource.** If you value what's been created, the best way to show appreciation is by contributing code, documentation, or helping other users.

> ## 🔑 API KEY INFORMATION - UPDATED
>
> We have tested and confirmed that **both Gemini and OpenAI APIs work properly** with the current version. **Gemini 2.0 Flash is now the recommended choice for Live Interview Mode** due to its superior real-time audio processing capabilities.
>
> If you are experiencing issues with your API keys:
>
> - Try deleting your API key entry from the config file located in your user data directory
> - Log out and log back in to the application
> - Check your API key dashboard to verify the key is active and has sufficient credits
> - Ensure you're using the correct API key format (OpenAI keys start with "sk-", Gemini keys are alphanumeric)
>
> The configuration file is stored at: `C:\Users\[USERNAME]\AppData\Roaming\interview-coder-v1\config.json` (on Windows) or `/Users/[USERNAME]/Library/Application Support/interview-coder-v1/config.json` (on macOS)

## Free, Open-Source AI-Powered Interview Preparation Tool

This project provides a powerful alternative to premium coding interview platforms. It delivers the core functionality of paid interview preparation tools but in a free, open-source package. Using your own API key, you get access to advanced features like AI-powered problem analysis, solution generation, debugging assistance, and **real-time live interview support** - all running locally on your machine.

### 🆕 NEW: Live Interview Mode

**Experience real-time AI assistance during live interviews!**

- **🎤 Live Audio Processing**: Uses WebRTC MediaRecorder API for seamless audio capture
- **🧠 Real-time AI Responses**: Powered by Gemini 2.0 Flash for instant transcription and answer generation
- **👁️ Optional Screen Capture**: Automatic screenshot capture during processing
- **🔇 Stealth Operation**: Minimal UI distractions, designed for discrete use
- **⚡ Fast Response Times**: Optimized for real-time interview scenarios

### Why This Exists

The best coding interview tools are often behind expensive paywalls, making them inaccessible to many students and job seekers. This project provides the same powerful functionality without the cost barrier, letting you:

- Use your own API key (pay only for what you use)
- Run everything locally on your machine with complete privacy
- Make customizations to suit your specific needs
- Learn from and contribute to an open-source tool

### Two Powerful Modes

#### 📸 Coding Mode (Original)
- Take screenshots of coding problems
- AI-powered problem analysis and solution generation
- Detailed explanations with time/space complexity analysis
- Real-time debugging assistance

#### 🎤 Live Interview Mode (NEW)
- Real-time audio transcription during interviews
- Instant AI-generated responses and suggestions
- Supports both technical and behavioral questions
- Optional automatic screen capture
- Minimal, stealth-friendly interface

### Customization Possibilities

The codebase is designed to be adaptable:

- **AI Models**: Though currently using OpenAI and Gemini models, you can modify the code to integrate with other providers like Claude, Deepseek, Llama, or any model with an API. All integration code is in `electron/ProcessingHelper.ts` and UI settings are in `src/components/Settings/SettingsDialog.tsx`.
- **Languages**: Add support for additional programming languages
- **Features**: Extend the functionality with new capabilities 
- **UI**: Customize the interface to your preferences

All it takes is modest JavaScript/TypeScript knowledge and understanding of the API you want to integrate.

## Features

### Core Features
- 🎯 99% Invisibility: Undetectable window that bypasses most screen capture methods
- 📸 Smart Screenshot Capture: Capture both question text and code separately for better analysis
- 🤖 AI-Powered Analysis: Automatically extracts and analyzes coding problems using advanced AI models
- 💡 Solution Generation: Get detailed explanations and solutions with time/space complexity analysis
- 🔧 Real-time Debugging: Debug your code with AI assistance and structured feedback
- 🎨 Advanced Window Management: Freely move, resize, change opacity, and zoom the window
- 🔄 Model Selection: Choose between multiple AI providers and models for different processing stages
- 🔒 Privacy-Focused: Your API key and data never leave your computer except for API calls

### Live Interview Mode Features
- 🎤 **Real-time Audio Capture**: Uses browser's native WebRTC MediaRecorder API
- 🧠 **Instant AI Processing**: Powered by Gemini 2.0 Flash for real-time transcription and response generation
- 📊 **Audio Level Monitoring**: Visual feedback for microphone input levels
- ⚙️ **Configurable Settings**: Adjust sensitivity, chunk duration, and auto-screenshot preferences
- 📱 **Responsive Interface**: Clean, minimal UI designed for stealth operation
- 🔄 **Response History**: Keep track of recent questions and AI responses
- 📸 **Optional Screen Capture**: Automatic screenshot capture during audio processing

## Global Commands

The application uses unidentifiable global keyboard shortcuts that won't be detected by browsers or other applications:

- Toggle Window Visibility: [Control or Cmd + B]
- Move Window: [Control or Cmd + Arrow keys]
- Take Screenshot: [Control or Cmd + H]
- Delete Last Screenshot: [Control or Cmd + L]
- Process Screenshots: [Control or Cmd + Enter]
- Start New Problem: [Control or Cmd + R]
- Quit: [Control or Cmd + Q]
- Decrease Opacity: [Control or Cmd + []
- Increase Opacity: [Control or Cmd + ]]
- Zoom Out: [Control or Cmd + -]
- Reset Zoom: [Control or Cmd + 0]
- Zoom In: [Control or Cmd + =]

## Invisibility Compatibility

The application is invisible to:

- Zoom versions below 6.1.6 (inclusive)
- All browser-based screen recording software
- All versions of Discord
- Mac OS _screenshot_ functionality (Command + Shift + 3/4)

Note: The application is **NOT** invisible to:

- Zoom versions 6.1.6 and above
  - https://zoom.en.uptodown.com/mac/versions (link to downgrade Zoom if needed)
- Mac OS native screen _recording_ (Command + Shift + 5)

## Prerequisites

- Node.js (v16 or higher)
- npm or bun package manager
- API Key (OpenAI or **Gemini recommended for Live Interview Mode**)
- Screen Recording Permission for Terminal/IDE
- **Microphone Permission for Live Interview Mode**
  - On macOS:
    1. Go to System Preferences > Security & Privacy > Privacy > Microphone
    2. Ensure that CodeInterviewAssist has microphone access enabled
    3. Restart CodeInterviewAssist after enabling permissions
  - On Windows:
    - Go to Settings > Privacy > Microphone
    - Enable microphone access for desktop apps
  - On Linux:
    - May require additional audio permissions depending on your distribution

## Running the Application

### Quick Start

1. Clone the repository:

```bash
git clone https://github.com/greeneu/interview-coder-withoupaywall-opensource.git
cd interview-coder-withoupaywall-opensource
```

2. Install dependencies:

```bash
npm install
```

3. **RECOMMENDED**: Clean any previous builds:

```bash
npm run clean
```

4. Run the appropriate script for your platform:

**For Windows:**
```bash
stealth-run.bat
```

**For macOS/Linux:**
```bash
# Make the script executable first
chmod +x stealth-run.sh
./stealth-run.sh
```

**IMPORTANT**: The application window will be invisible by default! Use Ctrl+B (or Cmd+B on Mac) to toggle visibility.

### Building Distributable Packages

To create installable packages for distribution:

**For macOS (DMG):**
```bash
# Using npm
npm run package-mac

# Or using yarn
yarn package-mac
```

**For Windows (Installer):**
```bash
# Using npm
npm run package-win

# Or using yarn
yarn package-win
```

The packaged applications will be available in the `release` directory.

**What the scripts do:**
- Create necessary directories for the application
- Clean previous builds to ensure a fresh start
- Build the application in production mode
- Launch the application in invisible mode

### Notes & Troubleshooting

- **Window Manager Compatibility**: Some window management tools (like Rectangle Pro on macOS) may interfere with the app's window movement. Consider disabling them temporarily.

- **API Usage**: Be mindful of your API key's rate limits and credit usage. Vision API calls are more expensive than text-only calls.

- **Live Interview Mode**: Requires microphone permissions and works best with Gemini 2.0 Flash for optimal real-time performance.

- **LLM Customization**: You can easily customize the app to include LLMs like Claude, Deepseek, or Grok by modifying the API calls in `ProcessingHelper.ts` and related UI components.

- **Common Issues**:
  - Run `npm run clean` before starting the app for a fresh build
  - Use Ctrl+B/Cmd+B multiple times if the window doesn't appear
  - Adjust window opacity with Ctrl+[/]/Cmd+[/] if needed
  - For macOS: ensure script has execute permissions (`chmod +x stealth-run.sh`)
  - For Live Interview Mode: ensure microphone permissions are granted

## Comparison with Paid Interview Tools

| Feature | Premium Tools (Paid) | CodeInterviewAssist (This Project) |
|---------|------------------------|----------------------------------------|
| Price | $60/month subscription | Free (only pay for your API usage) |
| Solution Generation | ✅ | ✅ |
| Debugging Assistance | ✅ | ✅ |
| **Live Audio Processing** | ✅ | ✅ **NEW** |
| **Real-time AI Responses** | ✅ | ✅ **NEW** |
| Invisibility | ✅ | ✅ |
| Multi-language Support | ✅ | ✅ |
| Time/Space Complexity Analysis | ✅ | ✅ |
| Window Management | ✅ | ✅ |
| Auth System | Required | None (Simplified) |
| Payment Processing | Required | None (Use your own API key) |
| Privacy | Server-processed | 100% Local Processing |
| Customization | Limited | Full Source Code Access |
| Model Selection | Limited | Choice Between Multiple Providers |

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- Radix UI Components
- **WebRTC MediaRecorder API** (for Live Interview Mode)
- OpenAI API
- **Gemini 2.0 Flash API** (recommended for Live Interview Mode)
- Anthropic Claude API

## How It Works

### Coding Mode (Original)

1. **Initial Setup**
   - Launch the invisible window
   - Enter your API key in the settings
   - Choose your preferred model for extraction, solution generation, and debugging

2. **Capturing Problem**
   - Use global shortcut [Control or Cmd + H] to take screenshots of code problems
   - Screenshots are automatically added to the queue of up to 5
   - If needed, remove the last screenshot with [Control or Cmd + L]

3. **Processing**
   - Press [Control or Cmd + Enter] to analyze the screenshots
   - AI extracts problem requirements from the screenshots using Vision API
   - The model generates an optimal solution based on the extracted information
   - All analysis is done using your personal API key

4. **Solution & Debugging**
   - View the generated solutions with detailed explanations
   - Use debugging feature by taking more screenshots of error messages or code
   - Get structured analysis with identified issues, corrections, and optimizations
   - Toggle between solutions and queue views as needed

### Live Interview Mode (NEW)

1. **Setup**
   - Switch to Live Interview Mode using the mode selector
   - Ensure microphone permissions are granted
   - **Gemini 2.0 Flash is recommended** for optimal performance

2. **Live Listening**
   - Click the microphone button to start live audio capture
   - Audio is processed in configurable chunks (default: 3 seconds)
   - Real-time audio level monitoring provides visual feedback

3. **AI Processing**
   - Audio chunks are sent directly to Gemini 2.0 Flash
   - AI handles both transcription and response generation in one step
   - Responses appear in real-time with confidence scores

4. **Response Display**
   - Current question transcription is highlighted
   - AI responses include both technical and behavioral guidance
   - Response history is maintained for the session
   - Optional automatic screenshot capture during processing

5. **Stealth Operation**
   - Minimal UI designed for discrete use during interviews
   - Global shortcuts work in both modes
   - Window can be hidden/shown instantly with Ctrl+B/Cmd+B

## Configuration

- **API Key**: Your personal API key is stored locally and only used for API calls
- **Model Selection**: Choose between different AI providers and models:
  - **OpenAI**: GPT-4o and GPT-4o-mini
  - **Gemini**: Gemini 1.5 Pro and **Gemini 2.0 Flash** (recommended for Live Interview Mode)
  - **Anthropic**: Claude 3.7 Sonnet, Claude 3.5 Sonnet, and Claude 3 Opus
- **Language**: Select your preferred programming language for solutions
- **Live Interview Settings**: Configure audio sensitivity, chunk duration, and auto-screenshot preferences
- **Window Controls**: Adjust opacity, position, and zoom level using keyboard shortcuts
- **All settings are stored locally** in your user data directory and persist between sessions

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

### What This Means

- You are free to use, modify, and distribute this software
- If you modify the code, you must make your changes available under the same license
- If you run a modified version on a network server, you must make the source code available to users
- We strongly encourage you to contribute improvements back to the main project

See the [LICENSE-SHORT](LICENSE-SHORT) file for a summary of terms or visit [GNU AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) for the full license text.

### Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for more information.

## Disclaimer and Ethical Usage

This tool is intended as a learning aid and practice assistant. While it can help you understand problems and solution approaches during interviews, consider these ethical guidelines:

- Be honest about using assistance tools if asked directly in an interview
- Use this tool to learn concepts, not just to get answers
- Recognize that understanding solutions is more valuable than simply presenting them
- In take-home assignments, make sure you thoroughly understand any solutions you submit

Remember that the purpose of technical interviews is to assess your problem-solving skills and understanding. This tool works best when used to enhance your learning, not as a substitute for it.

## Support and Questions

If you have questions or need support, please open an issue on the GitHub repository.

---

> **Remember:** This is a community resource. If you find it valuable, consider contributing rather than just requesting features. The project grows through collective effort, not individual demands.