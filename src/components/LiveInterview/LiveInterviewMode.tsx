import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Camera, CameraOff, Settings, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '../../contexts/toast';

interface LiveInterviewModeProps {
  currentLanguage: string;
  setLanguage: (language: string) => void;
}

interface AudioChunk {
  data: Blob;
  timestamp: number;
  id: string;
}

interface GeminiResponse {
  transcription: string;
  answer: string;
  confidence: number;
  timestamp: number;
  id: string;
  isProcessing?: boolean;
  isStale?: boolean;
}

interface ProcessingQueue {
  [key: string]: {
    audioBlob: Blob;
    timestamp: number;
    promise: Promise<void>;
  };
}

export const LiveInterviewMode: React.FC<LiveInterviewModeProps> = ({
  currentLanguage,
  setLanguage
}) => {
  // Audio recording state
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [activeProcessingCount, setActiveProcessingCount] = useState(0);
  
  // Screen capture state
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const [autoScreenshot, setAutoScreenshot] = useState(true);
  
  // Response state
  const [responses, setResponses] = useState<GeminiResponse[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState('');
  
  // Settings state - Optimized for better accuracy
  const [sensitivity, setSensitivity] = useState(0.4); // Increased for better detection
  const [chunkDuration, setChunkDuration] = useState(4000); // Increased to 4 seconds for better accuracy
  const [showSettings, setShowSettings] = useState(false);
  const [maxConcurrentProcessing, setMaxConcurrentProcessing] = useState(2); // Reduced to prevent overwhelming
  const [minAudioLevel, setMinAudioLevel] = useState(0.02); // Minimum audio level to process
  const [responseUpdateDelay, setResponseUpdateDelay] = useState(1500); // Delay between response updates
  
  // Refs for continuous operation
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingQueueRef = useRef<ProcessingQueue>({});
  const chunkCounterRef = useRef(0);
  const continuousRecordingRef = useRef<boolean>(false);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastResponseTimeRef = useRef<number>(0);
  const pendingResponsesRef = useRef<GeminiResponse[]>([]);
  
  const { showToast } = useToast();

  // Generate unique IDs for chunks
  const generateChunkId = useCallback(() => {
    return `chunk_${Date.now()}_${++chunkCounterRef.current}`;
  }, []);

  // Initialize audio context with better settings for speech recognition
  const initializeAudioAnalysis = useCallback(async (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext({
        sampleRate: 16000, // Optimal for speech recognition
      });
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Optimized analyzer settings for speech
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.3;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;
      
      source.connect(analyserRef.current);
      
      // Enhanced audio level monitoring with speech detection
      const monitorAudioLevel = () => {
        if (!analyserRef.current || !continuousRecordingRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Focus on speech frequency range (300Hz - 3400Hz)
        const speechRange = dataArray.slice(8, 85); // Approximate speech frequencies
        const speechAverage = speechRange.reduce((sum, value) => sum + value, 0) / speechRange.length;
        const normalizedLevel = Math.min(speechAverage / 128, 1); // More sensitive to speech
        
        setAudioLevel(normalizedLevel);
        
        // Continue monitoring
        requestAnimationFrame(monitorAudioLevel);
      };
      
      monitorAudioLevel();
    } catch (error) {
      console.error('Error initializing audio analysis:', error);
    }
  }, []);

  // Staggered response updates to improve readability
  const updateResponsesWithDelay = useCallback((newResponse: GeminiResponse) => {
    const now = Date.now();
    
    // Add to pending responses
    pendingResponsesRef.current.push(newResponse);
    
    // Check if enough time has passed since last update
    if (now - lastResponseTimeRef.current >= responseUpdateDelay) {
      // Process all pending responses
      const responsesToAdd = [...pendingResponsesRef.current];
      pendingResponsesRef.current = [];
      lastResponseTimeRef.current = now;
      
      // Add responses with smooth transition
      setResponses(prev => {
        // Mark older responses as stale if too many
        const updatedPrev = prev.length > 15 
          ? prev.map((r, i) => i > 10 ? { ...r, isStale: true } : r)
          : prev;
        
        return [...responsesToAdd, ...updatedPrev].slice(0, 20);
      });
    } else {
      // Schedule delayed update
      setTimeout(() => {
        if (pendingResponsesRef.current.length > 0) {
          const responsesToAdd = [...pendingResponsesRef.current];
          pendingResponsesRef.current = [];
          lastResponseTimeRef.current = Date.now();
          
          setResponses(prev => {
            const updatedPrev = prev.length > 15 
              ? prev.map((r, i) => i > 10 ? { ...r, isStale: true } : r)
              : prev;
            
            return [...responsesToAdd, ...updatedPrev].slice(0, 20);
          });
        }
      }, responseUpdateDelay - (now - lastResponseTimeRef.current));
    }
  }, [responseUpdateDelay]);

  // Enhanced audio processing with better transcription
  const processAudioChunk = useCallback(async (audioBlob: Blob, chunkId: string) => {
    // Check audio size and quality
    if (audioBlob.size < 5000) { // Skip very small audio chunks
      return;
    }
    
    // Increment active processing count
    setActiveProcessingCount(prev => prev + 1);
    
    // Add placeholder response immediately for UI feedback
    const placeholderResponse: GeminiResponse = {
      id: chunkId,
      transcription: 'Analyzing audio...',
      answer: 'Processing your question...',
      confidence: 0,
      timestamp: Date.now(),
      isProcessing: true
    };
    
    // Use staggered updates for better UX
    updateResponsesWithDelay(placeholderResponse);
    
    try {
      // Convert blob to base64 with better error handling
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (result && result.includes(',')) {
            const base64 = result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Invalid audio data'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read audio file'));
        reader.readAsDataURL(audioBlob);
      });

      // Get current config
      const config = await window.electronAPI.getConfig();
      
      if (!config.apiKey || config.apiProvider !== 'gemini') {
        throw new Error('Gemini API key required for Live Interview Mode');
      }

      // Enhanced prompt for better transcription and responses
      const enhancedPrompt = `You are an expert AI interview assistant with advanced speech recognition capabilities. 

CRITICAL INSTRUCTIONS:
1. TRANSCRIBE EXACTLY what you hear - every word matters for interview accuracy
2. If audio is unclear, noisy, or too short (under 3 seconds of speech), respond with "UNCLEAR_AUDIO"
3. For technical questions: Provide concise, actionable answers in ${currentLanguage}
4. For behavioral questions: Give 2-3 key talking points
5. Keep responses under 150 words but comprehensive
6. Focus on practical, interview-appropriate advice

AUDIO ANALYSIS:
- Listen carefully for complete questions or statements
- Ignore background noise, typing, or non-speech sounds
- Only process clear human speech

FORMAT YOUR RESPONSE AS:
TRANSCRIPTION: [exact words spoken - be precise]
ANSWER: [your helpful, interview-focused response]

Current context: This is a live interview session where accuracy is critical.`;

      // Send to Gemini 2.0 Flash with optimized settings
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: enhancedPrompt
                  },
                  {
                    inlineData: {
                      mimeType: 'audio/webm;codecs=opus',
                      data: base64Audio
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1, // Lower temperature for more consistent transcription
              maxOutputTokens: 500,
              topP: 0.8,
              topK: 40
            },
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH", 
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
              }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Enhanced response parsing
      if (!content || content.includes('UNCLEAR_AUDIO') || content.length < 20) {
        // Remove placeholder response for unclear audio
        setResponses(prev => prev.filter(r => r.id !== chunkId));
        return;
      }
      
      // Parse response with better error handling
      const transcriptionMatch = content.match(/TRANSCRIPTION:\s*(.*?)(?=\n\s*ANSWER:|$)/s);
      const answerMatch = content.match(/ANSWER:\s*(.*)/s);
      
      const transcription = transcriptionMatch?.[1]?.trim() || '';
      const answer = answerMatch?.[1]?.trim() || content.trim();
      
      // Quality checks for transcription
      if (transcription.length < 5 || transcription.toLowerCase().includes('unclear') || 
          transcription.toLowerCase().includes('inaudible')) {
        setResponses(prev => prev.filter(r => r.id !== chunkId));
        return;
      }
      
      // Calculate confidence based on response quality
      let confidence = 0.7;
      if (transcription.length > 20 && answer.length > 30) confidence = 0.9;
      if (transcription.includes('?')) confidence += 0.05; // Questions are usually clearer
      if (answer.includes(currentLanguage.toLowerCase())) confidence += 0.05;
      
      const geminiResponse: GeminiResponse = {
        id: chunkId,
        transcription,
        answer,
        confidence: Math.min(confidence, 0.95),
        timestamp: Date.now(),
        isProcessing: false
      };
      
      // Update the placeholder response with actual data using staggered updates
      setResponses(prev => 
        prev.map(r => r.id === chunkId ? geminiResponse : r)
      );
      
      // Update current transcription to the most recent one
      setCurrentTranscription(transcription);
      
      // Auto screenshot if enabled and screen capturing
      if (autoScreenshot && isScreenCapturing && transcription.length > 10) {
        setTimeout(() => {
          window.electronAPI.triggerScreenshot().catch(console.error);
        }, 500); // Small delay to ensure response is processed
      }
      
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      
      // Remove failed placeholder
      setResponses(prev => prev.filter(r => r.id !== chunkId));
      
      // Only show toast for significant errors
      if (activeProcessingCount <= 1) {
        showToast('Error', 'Audio processing failed - check your Gemini API key', 'error');
      }
    } finally {
      // Decrement active processing count
      setActiveProcessingCount(prev => Math.max(0, prev - 1));
      
      // Clean up from processing queue
      delete processingQueueRef.current[chunkId];
    }
  }, [currentLanguage, showToast, autoScreenshot, isScreenCapturing, activeProcessingCount, updateResponsesWithDelay]);

  // Enhanced continuous recording with better audio quality
  const startContinuousRecording = useCallback(() => {
    if (!streamRef.current || continuousRecordingRef.current) return;
    
    continuousRecordingRef.current = true;
    
    const recordChunk = () => {
      if (!continuousRecordingRef.current || !streamRef.current) return;
      
      try {
        // Check current audio level before recording
        if (audioLevel < minAudioLevel) {
          return; // Skip recording if audio is too quiet
        }
        
        // Create new MediaRecorder with optimized settings
        const mediaRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 32000 // Higher quality for better transcription
        });
        
        const chunkId = generateChunkId();
        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          if (chunks.length > 0) {
            const audioBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
            
            // Enhanced quality checks
            const shouldProcess = audioBlob.size > 8000 && // Larger minimum size
                                Object.keys(processingQueueRef.current).length < maxConcurrentProcessing &&
                                audioLevel > minAudioLevel;
            
            if (shouldProcess) {
              const processingPromise = processAudioChunk(audioBlob, chunkId);
              
              processingQueueRef.current[chunkId] = {
                audioBlob,
                timestamp: Date.now(),
                promise: processingPromise
              };
            }
          }
        };
        
        // Record for the specified duration
        mediaRecorder.start();
        
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        }, chunkDuration);
        
      } catch (error) {
        console.error('Error in continuous recording:', error);
      }
    };
    
    // Start first chunk after a brief delay
    setTimeout(recordChunk, 500);
    
    // Set up interval for continuous chunks with less overlap for better accuracy
    recordingIntervalRef.current = setInterval(recordChunk, chunkDuration * 0.8); // 20% overlap
  }, [chunkDuration, generateChunkId, processAudioChunk, maxConcurrentProcessing, audioLevel, minAudioLevel]);

  // Stop continuous recording
  const stopContinuousRecording = useCallback(() => {
    continuousRecordingRef.current = false;
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    // Clear pending responses
    pendingResponsesRef.current = [];
    
    // Wait for all processing to complete
    Promise.all(
      Object.values(processingQueueRef.current).map(item => item.promise)
    ).then(() => {
      console.log('All audio processing completed');
    }).catch(console.error);
  }, []);

  // Start listening with enhanced microphone settings
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
          volume: 1.0
        } 
      });
      
      streamRef.current = stream;
      await initializeAudioAnalysis(stream);
      
      setIsListening(true);
      
      // Start recording after audio analysis is ready
      setTimeout(() => {
        startContinuousRecording();
      }, 1000);
      
      showToast('Success', 'Enhanced listening mode activated', 'success');
      
    } catch (error) {
      console.error('Error starting audio capture:', error);
      showToast('Error', 'Microphone access denied or unavailable', 'error');
    }
  }, [initializeAudioAnalysis, startContinuousRecording, showToast]);

  // Stop listening
  const stopListening = useCallback(() => {
    stopContinuousRecording();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsListening(false);
    setAudioLevel(0);
    setCurrentTranscription('');
    showToast('Success', 'Listening stopped', 'success');
  }, [stopContinuousRecording, showToast]);

  // Toggle screen capture
  const toggleScreenCapture = useCallback(async () => {
    if (!isScreenCapturing) {
      try {
        await window.electronAPI.triggerScreenshot();
        setIsScreenCapturing(true);
        showToast('Success', 'Screen capture enabled', 'success');
      } catch (error) {
        showToast('Error', 'Failed to enable screen capture', 'error');
      }
    } else {
      setIsScreenCapturing(false);
      showToast('Success', 'Screen capture disabled', 'success');
    }
  }, [isScreenCapturing, showToast]);

  // Clear all responses
  const clearResponses = useCallback(() => {
    setResponses([]);
    setCurrentTranscription('');
    pendingResponsesRef.current = [];
    showToast('Success', 'Response history cleared', 'success');
  }, [showToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white">
      {/* Glassmorphism container */}
      <div className="min-h-screen backdrop-blur-xl bg-black/20 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header with glassmorphism */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Live Interview Mode
                </h1>
                <p className="text-white/70 text-sm mt-2">
                  Enhanced real-time AI assistance with improved accuracy and smooth transitions
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearResponses}
                  className="text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
                  disabled={responses.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(!showSettings)}
                  className="text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Settings Panel */}
          {showSettings && (
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl transition-all duration-300">
              <h3 className="font-semibold text-lg mb-4 text-white/90">Audio Processing Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-medium">Audio Sensitivity</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs text-white/50">{sensitivity.toFixed(1)}</span>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-medium">Chunk Duration</label>
                  <input
                    type="range"
                    min="2000"
                    max="6000"
                    step="500"
                    value={chunkDuration}
                    onChange={(e) => setChunkDuration(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs text-white/50">{chunkDuration}ms</span>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-medium">Response Delay</label>
                  <input
                    type="range"
                    min="500"
                    max="3000"
                    step="250"
                    value={responseUpdateDelay}
                    onChange={(e) => setResponseUpdateDelay(parseInt(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs text-white/50">{responseUpdateDelay}ms</span>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-white/70 font-medium">Min Audio Level</label>
                  <input
                    type="range"
                    min="0.01"
                    max="0.1"
                    step="0.01"
                    value={minAudioLevel}
                    onChange={(e) => setMinAudioLevel(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs text-white/50">{minAudioLevel.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={autoScreenshot}
                    onChange={(e) => setAutoScreenshot(e.target.checked)}
                    className="rounded bg-white/20 border-white/30"
                  />
                  Auto Screenshot on Questions
                </label>
                
                <div className="text-xs text-white/60">
                  Max Concurrent: {maxConcurrentProcessing} • Language: {currentLanguage}
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Control Panel */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center justify-center gap-8">
              {/* Microphone Control */}
              <div className="flex flex-col items-center gap-3">
                <Button
                  onClick={isListening ? stopListening : startListening}
                  className={`w-20 h-20 rounded-full transition-all duration-300 shadow-lg ${
                    isListening 
                      ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/25' 
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-blue-500/25'
                  }`}
                >
                  {isListening ? (
                    <MicOff className="h-8 w-8" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </Button>
                
                <div className="text-center">
                  <p className="text-sm font-semibold text-white/90">
                    {isListening ? 'Enhanced Listening' : 'Start Enhanced Mode'}
                  </p>
                  {isListening && (
                    <div className="w-32 h-3 bg-white/20 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-150 shadow-lg"
                        style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                      />
                    </div>
                  )}
                  {isListening && (
                    <p className="text-xs text-white/60 mt-1">
                      Level: {(audioLevel * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
              </div>

              {/* Screen Capture Control */}
              <div className="flex flex-col items-center gap-3">
                <Button
                  onClick={toggleScreenCapture}
                  className={`w-20 h-20 rounded-full transition-all duration-300 shadow-lg ${
                    isScreenCapturing 
                      ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-green-500/25' 
                      : 'bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 shadow-gray-500/25'
                  }`}
                >
                  {isScreenCapturing ? (
                    <Camera className="h-8 w-8" />
                  ) : (
                    <CameraOff className="h-8 w-8" />
                  )}
                </Button>
                
                <div className="text-center">
                  <p className="text-sm font-semibold text-white/90">
                    {isScreenCapturing ? 'Screen Active' : 'Screen Inactive'}
                  </p>
                  <p className="text-xs text-white/60">
                    {autoScreenshot ? 'Auto-capture ON' : 'Manual only'}
                  </p>
                </div>
              </div>

              {/* Processing Indicator */}
              <div className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                  activeProcessingCount > 0 
                    ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-2 border-yellow-400 shadow-yellow-500/25' 
                    : 'bg-gradient-to-r from-gray-500/20 to-gray-600/20 border-2 border-gray-500 shadow-gray-500/25'
                }`}>
                  {activeProcessingCount > 0 ? (
                    <div className="w-8 h-8 border-3 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-400" />
                  )}
                </div>
                
                <div className="text-center">
                  <p className="text-sm font-semibold text-white/90">
                    {activeProcessingCount > 0 ? `Processing ${activeProcessingCount}` : 'Ready'}
                  </p>
                  <p className="text-xs text-white/60">
                    Queue: {Object.keys(processingQueueRef.current).length}/{maxConcurrentProcessing}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Current Transcription with enhanced styling */}
          {currentTranscription && (
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-md border border-blue-500/20 rounded-2xl p-6 shadow-2xl transition-all duration-500">
              <h3 className="font-semibold text-blue-400 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                Latest Question:
              </h3>
              <p className="text-white/90 text-lg leading-relaxed">{currentTranscription}</p>
            </div>
          )}

          {/* Enhanced Responses */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-lg text-white/90">AI Responses</h3>
              <div className="flex items-center gap-4 text-sm text-white/60">
                <span>{responses.length} responses</span>
                {activeProcessingCount > 0 && (
                  <span className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    {activeProcessingCount} processing
                  </span>
                )}
              </div>
            </div>
            
            {responses.length === 0 ? (
              <div className="text-center py-12 text-white/50">
                <Mic className="h-16 w-16 mx-auto mb-6 opacity-50" />
                <p className="text-lg mb-2">Start enhanced listening to see AI responses</p>
                <p className="text-sm">Improved accuracy with smooth, readable updates</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                {responses.map((response, index) => (
                  <div 
                    key={response.id}
                    className={`border rounded-xl p-5 space-y-3 transition-all duration-500 ${
                      response.isProcessing 
                        ? 'bg-gradient-to-r from-yellow-500/5 to-orange-500/5 border-yellow-500/20 shadow-yellow-500/10' 
                        : response.isStale
                        ? 'bg-white/2 border-white/5 opacity-60'
                        : 'bg-white/5 border-white/10 hover:bg-white/8 shadow-lg'
                    }`}
                    style={{
                      animationDelay: `${index * 100}ms`,
                      animation: response.isProcessing ? 'none' : 'fadeInUp 0.5s ease-out'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/50 font-medium">
                        {new Date(response.timestamp).toLocaleTimeString()}
                      </span>
                      <div className="flex items-center gap-3">
                        {response.isProcessing && (
                          <div className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        )}
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          response.isProcessing 
                            ? 'bg-yellow-500/20 text-yellow-400' 
                            : response.confidence > 0.8
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {response.isProcessing ? 'Processing...' : `${Math.round(response.confidence * 100)}% confidence`}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-sm text-white/70 mb-1 font-medium">Question:</p>
                        <p className="text-white/90 leading-relaxed">{response.transcription}</p>
                      </div>
                      
                      <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-lg p-3">
                        <p className="text-sm text-blue-400 mb-1 font-medium">AI Response:</p>
                        <p className="text-white/90 leading-relaxed">{response.answer}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Status Bar */}
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                <span className={`flex items-center gap-2 font-medium ${isListening ? 'text-green-400' : 'text-white/50'}`}>
                  <div className={`w-3 h-3 rounded-full ${isListening ? 'bg-green-400 animate-pulse shadow-green-400/50' : 'bg-white/50'}`} />
                  {isListening ? 'Enhanced Mode Active' : 'Offline'}
                </span>
                
                <span className="text-white/70">
                  Language: <span className="font-medium">{currentLanguage}</span>
                </span>
                
                <span className="text-white/70">
                  Audio Quality: <span className="font-medium">16kHz Optimized</span>
                </span>
              </div>
              
              <div className="text-white/50 text-xs">
                Press Ctrl+B to hide/show • Enhanced accuracy mode
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Custom styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: linear-gradient(45deg, #3b82f6, #8b5cf6);
          cursor: pointer;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};