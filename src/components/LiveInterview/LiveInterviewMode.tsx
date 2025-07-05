import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Camera, CameraOff, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '../../contexts/toast';

interface LiveInterviewModeProps {
  currentLanguage: string;
  setLanguage: (language: string) => void;
}

interface AudioChunk {
  data: Blob;
  timestamp: number;
}

interface GeminiResponse {
  transcription: string;
  answer: string;
  confidence: number;
  timestamp: number;
}

export const LiveInterviewMode: React.FC<LiveInterviewModeProps> = ({
  currentLanguage,
  setLanguage
}) => {
  // Audio recording state
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Screen capture state
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const [autoScreenshot, setAutoScreenshot] = useState(true);
  
  // Response state
  const [responses, setResponses] = useState<GeminiResponse[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState('');
  
  // Settings state
  const [sensitivity, setSensitivity] = useState(0.3);
  const [chunkDuration, setChunkDuration] = useState(3000); // 3 seconds
  const [showSettings, setShowSettings] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<AudioChunk[]>([]);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { showToast } = useToast();

  // Initialize audio context and analyzer for volume detection
  const initializeAudioAnalysis = useCallback(async (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      // Start monitoring audio levels
      const monitorAudioLevel = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedLevel = average / 255;
        setAudioLevel(normalizedLevel);
        
        if (isListening) {
          requestAnimationFrame(monitorAudioLevel);
        }
      };
      
      monitorAudioLevel();
    } catch (error) {
      console.error('Error initializing audio analysis:', error);
    }
  }, [isListening]);

  // Process audio chunk with Gemini
  const processAudioChunk = useCallback(async (audioBlob: Blob) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // Convert blob to base64
      const base64Audio = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });

      // Get current config
      const config = await window.electronAPI.getConfig();
      
      if (!config.apiKey || config.apiProvider !== 'gemini') {
        showToast('Error', 'Gemini API key required for Live Interview Mode', 'error');
        return;
      }

      // Send to Gemini 2.0 Flash for transcription + response
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
                    text: `You are an AI interview assistant. Listen to this audio and:
1. Transcribe what the interviewer is saying
2. If it's a technical question, provide a concise, helpful answer in ${currentLanguage}
3. If it's a behavioral question, provide key talking points
4. Keep responses brief and actionable

Format your response as:
TRANSCRIPTION: [what was said]
ANSWER: [your helpful response]`
                  },
                  {
                    inlineData: {
                      mimeType: 'audio/webm',
                      data: base64Audio
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 500
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Parse response
      const transcriptionMatch = content.match(/TRANSCRIPTION:\s*(.*?)(?=ANSWER:|$)/s);
      const answerMatch = content.match(/ANSWER:\s*(.*)/s);
      
      const transcription = transcriptionMatch?.[1]?.trim() || 'Could not transcribe audio';
      const answer = answerMatch?.[1]?.trim() || 'No response generated';
      
      const geminiResponse: GeminiResponse = {
        transcription,
        answer,
        confidence: 0.8, // Could be enhanced with actual confidence from API
        timestamp: Date.now()
      };
      
      setCurrentTranscription(transcription);
      setResponses(prev => [geminiResponse, ...prev.slice(0, 9)]); // Keep last 10 responses
      
    } catch (error) {
      console.error('Error processing audio:', error);
      showToast('Error', 'Failed to process audio', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, currentLanguage, showToast]);

  // Start listening
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        } 
      });
      
      streamRef.current = stream;
      await initializeAudioAnalysis(stream);
      
      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push({
            data: event.data,
            timestamp: Date.now()
          });
        }
      };
      
      mediaRecorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const audioBlob = new Blob(
            chunksRef.current.map(chunk => chunk.data),
            { type: 'audio/webm' }
          );
          
          // Only process if audio is substantial enough
          if (audioBlob.size > 1000) { // Minimum 1KB
            processAudioChunk(audioBlob);
          }
        }
        chunksRef.current = [];
      };
      
      // Start recording in chunks
      mediaRecorder.start();
      setIsListening(true);
      
      // Process chunks periodically
      const processChunks = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          setTimeout(() => {
            if (isListening && streamRef.current) {
              mediaRecorderRef.current?.start();
              processingTimeoutRef.current = setTimeout(processChunks, chunkDuration);
            }
          }, 100);
        }
      };
      
      processingTimeoutRef.current = setTimeout(processChunks, chunkDuration);
      
      showToast('Success', 'Live listening started', 'success');
      
    } catch (error) {
      console.error('Error starting audio capture:', error);
      showToast('Error', 'Failed to access microphone', 'error');
    }
  }, [initializeAudioAnalysis, processAudioChunk, chunkDuration, isListening]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    
    setIsListening(false);
    setAudioLevel(0);
    showToast('Success', 'Live listening stopped', 'success');
  }, [showToast]);

  // Toggle screen capture
  const toggleScreenCapture = useCallback(async () => {
    if (!isScreenCapturing) {
      try {
        // Take initial screenshot
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

  // Auto screenshot when processing
  useEffect(() => {
    if (autoScreenshot && isProcessing && isScreenCapturing) {
      window.electronAPI.triggerScreenshot().catch(console.error);
    }
  }, [isProcessing, autoScreenshot, isScreenCapturing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Live Interview Mode</h1>
            <p className="text-white/70 text-sm">
              Real-time AI assistance during interviews
            </p>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="text-white/70 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-4">
            <h3 className="font-medium">Settings</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-white/70">Sensitivity</label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-white/50">{sensitivity}</span>
              </div>
              
              <div>
                <label className="text-sm text-white/70">Chunk Duration (ms)</label>
                <input
                  type="range"
                  min="1000"
                  max="10000"
                  step="1000"
                  value={chunkDuration}
                  onChange={(e) => setChunkDuration(parseInt(e.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-white/50">{chunkDuration}ms</span>
              </div>
              
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoScreenshot}
                    onChange={(e) => setAutoScreenshot(e.target.checked)}
                    className="rounded"
                  />
                  Auto Screenshot
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Control Panel */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-6">
          <div className="flex items-center justify-center gap-6">
            {/* Microphone Control */}
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={isListening ? stopListening : startListening}
                className={`w-16 h-16 rounded-full ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
                disabled={isProcessing}
              >
                {isListening ? (
                  <MicOff className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>
              
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isListening ? 'Listening...' : 'Start Listening'}
                </p>
                {isListening && (
                  <div className="w-24 h-2 bg-white/20 rounded-full mt-1">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-100"
                      style={{ width: `${audioLevel * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Screen Capture Control */}
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={toggleScreenCapture}
                className={`w-16 h-16 rounded-full ${
                  isScreenCapturing 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-gray-500 hover:bg-gray-600'
                }`}
              >
                {isScreenCapturing ? (
                  <Camera className="h-6 w-6" />
                ) : (
                  <CameraOff className="h-6 w-6" />
                )}
              </Button>
              
              <p className="text-sm font-medium">
                {isScreenCapturing ? 'Screen Active' : 'Screen Inactive'}
              </p>
            </div>

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="flex flex-col items-center gap-2">
                <div className="w-16 h-16 rounded-full bg-yellow-500/20 border-2 border-yellow-500 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm font-medium text-yellow-500">Processing...</p>
              </div>
            )}
          </div>
        </div>

        {/* Current Transcription */}
        {currentTranscription && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <h3 className="font-medium text-blue-400 mb-2">Current Question:</h3>
            <p className="text-white/90">{currentTranscription}</p>
          </div>
        )}

        {/* Responses */}
        <div className="space-y-4">
          <h3 className="font-medium">AI Responses</h3>
          
          {responses.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Start listening to see AI responses here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {responses.map((response, index) => (
                <div 
                  key={response.timestamp}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">
                      {new Date(response.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-xs text-green-400">
                      {Math.round(response.confidence * 100)}% confidence
                    </span>
                  </div>
                  
                  <div>
                    <p className="text-sm text-white/70 mb-2">
                      <strong>Q:</strong> {response.transcription}
                    </p>
                    <p className="text-white/90">
                      <strong>A:</strong> {response.answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span className={`flex items-center gap-2 ${isListening ? 'text-green-400' : 'text-white/50'}`}>
                <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-400' : 'bg-white/50'}`} />
                {isListening ? 'Live' : 'Offline'}
              </span>
              
              <span className="text-white/70">
                Language: {currentLanguage}
              </span>
              
              <span className="text-white/70">
                Responses: {responses.length}
              </span>
            </div>
            
            <div className="text-white/50 text-xs">
              Press Ctrl+B to hide/show window
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};