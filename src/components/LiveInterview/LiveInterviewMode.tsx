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
  id: string;
}

interface GeminiResponse {
  transcription: string;
  answer: string;
  confidence: number;
  timestamp: number;
  id: string;
  isProcessing?: boolean;
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
  
  // Settings state
  const [sensitivity, setSensitivity] = useState(0.3);
  const [chunkDuration, setChunkDuration] = useState(2000); // Reduced to 2 seconds for faster response
  const [showSettings, setShowSettings] = useState(false);
  const [maxConcurrentProcessing, setMaxConcurrentProcessing] = useState(3);
  
  // Refs for continuous operation
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingQueueRef = useRef<ProcessingQueue>({});
  const chunkCounterRef = useRef(0);
  const continuousRecordingRef = useRef<boolean>(false);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { showToast } = useToast();

  // Generate unique IDs for chunks
  const generateChunkId = useCallback(() => {
    return `chunk_${Date.now()}_${++chunkCounterRef.current}`;
  }, []);

  // Initialize audio context and analyzer for volume detection
  const initializeAudioAnalysis = useCallback(async (stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      // Continuous audio level monitoring
      const monitorAudioLevel = () => {
        if (!analyserRef.current || !continuousRecordingRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
        const normalizedLevel = average / 255;
        setAudioLevel(normalizedLevel);
        
        // Continue monitoring
        requestAnimationFrame(monitorAudioLevel);
      };
      
      monitorAudioLevel();
    } catch (error) {
      console.error('Error initializing audio analysis:', error);
    }
  }, []);

  // Process audio chunk with Gemini (non-blocking, parallel)
  const processAudioChunk = useCallback(async (audioBlob: Blob, chunkId: string) => {
    // Increment active processing count
    setActiveProcessingCount(prev => prev + 1);
    
    // Add placeholder response immediately for UI feedback
    const placeholderResponse: GeminiResponse = {
      id: chunkId,
      transcription: 'Processing audio...',
      answer: 'Generating response...',
      confidence: 0,
      timestamp: Date.now(),
      isProcessing: true
    };
    
    setResponses(prev => [placeholderResponse, ...prev.slice(0, 19)]); // Keep last 20
    
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
        throw new Error('Gemini API key required for Live Interview Mode');
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
5. If audio is unclear or silent, respond with "UNCLEAR_AUDIO"

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
              maxOutputTokens: 400
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Skip processing if audio was unclear
      if (content.includes('UNCLEAR_AUDIO')) {
        // Remove placeholder response
        setResponses(prev => prev.filter(r => r.id !== chunkId));
        return;
      }
      
      // Parse response
      const transcriptionMatch = content.match(/TRANSCRIPTION:\s*(.*?)(?=ANSWER:|$)/s);
      const answerMatch = content.match(/ANSWER:\s*(.*)/s);
      
      const transcription = transcriptionMatch?.[1]?.trim() || 'Could not transcribe audio';
      const answer = answerMatch?.[1]?.trim() || 'No response generated';
      
      // Skip if transcription is too short (likely noise)
      if (transcription.length < 10) {
        setResponses(prev => prev.filter(r => r.id !== chunkId));
        return;
      }
      
      const geminiResponse: GeminiResponse = {
        id: chunkId,
        transcription,
        answer,
        confidence: 0.8, // Could be enhanced with actual confidence from API
        timestamp: Date.now(),
        isProcessing: false
      };
      
      // Update the placeholder response with actual data
      setResponses(prev => 
        prev.map(r => r.id === chunkId ? geminiResponse : r)
      );
      
      // Update current transcription to the most recent one
      setCurrentTranscription(transcription);
      
      // Auto screenshot if enabled and screen capturing
      if (autoScreenshot && isScreenCapturing) {
        window.electronAPI.triggerScreenshot().catch(console.error);
      }
      
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      
      // Remove failed placeholder
      setResponses(prev => prev.filter(r => r.id !== chunkId));
      
      // Only show toast for first few errors to avoid spam
      if (activeProcessingCount <= 2) {
        showToast('Error', 'Failed to process audio chunk', 'error');
      }
    } finally {
      // Decrement active processing count
      setActiveProcessingCount(prev => Math.max(0, prev - 1));
      
      // Clean up from processing queue
      delete processingQueueRef.current[chunkId];
    }
  }, [currentLanguage, showToast, autoScreenshot, isScreenCapturing, activeProcessingCount]);

  // Continuous recording manager
  const startContinuousRecording = useCallback(() => {
    if (!streamRef.current || continuousRecordingRef.current) return;
    
    continuousRecordingRef.current = true;
    
    const recordChunk = () => {
      if (!continuousRecordingRef.current || !streamRef.current) return;
      
      try {
        // Create new MediaRecorder for this chunk
        const mediaRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'audio/webm;codecs=opus'
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
            const audioBlob = new Blob(chunks, { type: 'audio/webm' });
            
            // Only process if audio is substantial and we're not at max capacity
            if (audioBlob.size > 1000 && Object.keys(processingQueueRef.current).length < maxConcurrentProcessing) {
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
    
    // Start first chunk immediately
    recordChunk();
    
    // Set up interval for continuous chunks with overlap
    recordingIntervalRef.current = setInterval(recordChunk, chunkDuration * 0.7); // 30% overlap
  }, [chunkDuration, generateChunkId, processAudioChunk, maxConcurrentProcessing]);

  // Stop continuous recording
  const stopContinuousRecording = useCallback(() => {
    continuousRecordingRef.current = false;
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    // Wait for all processing to complete
    Promise.all(
      Object.values(processingQueueRef.current).map(item => item.promise)
    ).then(() => {
      console.log('All audio processing completed');
    }).catch(console.error);
  }, []);

  // Start listening
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        } 
      });
      
      streamRef.current = stream;
      await initializeAudioAnalysis(stream);
      
      setIsListening(true);
      startContinuousRecording();
      
      showToast('Success', 'Live listening started - fully autonomous mode', 'success');
      
    } catch (error) {
      console.error('Error starting audio capture:', error);
      showToast('Error', 'Failed to access microphone', 'error');
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
    showToast('Success', 'Live listening stopped', 'success');
  }, [stopContinuousRecording, showToast]);

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
              Autonomous real-time AI assistance - no manual triggers needed
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
            <h3 className="font-medium">Autonomous Processing Settings</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-white/70">Audio Sensitivity</label>
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
                  max="5000"
                  step="500"
                  value={chunkDuration}
                  onChange={(e) => setChunkDuration(parseInt(e.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-white/50">{chunkDuration}ms</span>
              </div>
              
              <div>
                <label className="text-sm text-white/70">Max Parallel Processing</label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={maxConcurrentProcessing}
                  onChange={(e) => setMaxConcurrentProcessing(parseInt(e.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-white/50">{maxConcurrentProcessing}</span>
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
              >
                {isListening ? (
                  <MicOff className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>
              
              <div className="text-center">
                <p className="text-sm font-medium">
                  {isListening ? 'Autonomous Listening' : 'Start Autonomous Mode'}
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
            <div className="flex flex-col items-center gap-2">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                activeProcessingCount > 0 
                  ? 'bg-yellow-500/20 border-2 border-yellow-500' 
                  : 'bg-gray-500/20 border-2 border-gray-500'
              }`}>
                {activeProcessingCount > 0 ? (
                  <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-500" />
                )}
              </div>
              <p className="text-sm font-medium">
                {activeProcessingCount > 0 ? `Processing ${activeProcessingCount}` : 'Ready'}
              </p>
            </div>
          </div>
        </div>

        {/* Current Transcription */}
        {currentTranscription && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <h3 className="font-medium text-blue-400 mb-2">Latest Question:</h3>
            <p className="text-white/90">{currentTranscription}</p>
          </div>
        )}

        {/* Responses */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">AI Responses</h3>
            <span className="text-xs text-white/50">
              {responses.length} responses • {activeProcessingCount} processing
            </span>
          </div>
          
          {responses.length === 0 ? (
            <div className="text-center py-8 text-white/50">
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Start autonomous listening to see AI responses here</p>
              <p className="text-xs mt-2">No manual triggers needed - fully automatic</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {responses.map((response, index) => (
                <div 
                  key={response.id}
                  className={`border rounded-lg p-4 space-y-2 ${
                    response.isProcessing 
                      ? 'bg-yellow-500/5 border-yellow-500/20' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">
                      {new Date(response.timestamp).toLocaleTimeString()}
                    </span>
                    <div className="flex items-center gap-2">
                      {response.isProcessing && (
                        <div className="w-3 h-3 border border-yellow-500 border-t-transparent rounded-full animate-spin" />
                      )}
                      <span className="text-xs text-green-400">
                        {response.isProcessing ? 'Processing...' : `${Math.round(response.confidence * 100)}% confidence`}
                      </span>
                    </div>
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
                <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-400 animate-pulse' : 'bg-white/50'}`} />
                {isListening ? 'Autonomous Mode Active' : 'Offline'}
              </span>
              
              <span className="text-white/70">
                Language: {currentLanguage}
              </span>
              
              <span className="text-white/70">
                Queue: {Object.keys(processingQueueRef.current).length}/{maxConcurrentProcessing}
              </span>
            </div>
            
            <div className="text-white/50 text-xs">
              Press Ctrl+B to hide/show • Fully autonomous operation
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};