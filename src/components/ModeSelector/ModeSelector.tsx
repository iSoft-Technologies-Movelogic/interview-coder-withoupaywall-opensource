import React from 'react';
import { Camera, Mic } from 'lucide-react';
import { Button } from '../ui/button';

export type AppMode = 'coding' | 'live-interview';

interface ModeSelectorProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onModeChange
}) => {
  return (
    <div className="bg-black border-b border-white/10 p-4">
      <div className="flex items-center justify-center gap-4">
        <Button
          variant={currentMode === 'coding' ? 'default' : 'outline'}
          onClick={() => onModeChange('coding')}
          className={`flex items-center gap-2 px-6 py-3 ${
            currentMode === 'coding'
              ? 'bg-white text-black hover:bg-white/90'
              : 'border-white/20 text-white hover:bg-white/10'
          }`}
        >
          <Camera className="h-4 w-4" />
          Coding Mode
        </Button>
        
        <Button
          variant={currentMode === 'live-interview' ? 'default' : 'outline'}
          onClick={() => onModeChange('live-interview')}
          className={`flex items-center gap-2 px-6 py-3 ${
            currentMode === 'live-interview'
              ? 'bg-white text-black hover:bg-white/90'
              : 'border-white/20 text-white hover:bg-white/10'
          }`}
        >
          <Mic className="h-4 w-4" />
          Live Interview Mode
        </Button>
      </div>
      
      <div className="text-center mt-2">
        <p className="text-xs text-white/60">
          {currentMode === 'coding' 
            ? 'Take screenshots and get AI-generated solutions'
            : 'Real-time audio transcription and AI assistance'
          }
        </p>
      </div>
    </div>
  );
};