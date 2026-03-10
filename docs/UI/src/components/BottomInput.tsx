import React, { useState, useRef, useEffect } from 'react';
import { Send, RefreshCcw, ArrowLeftRight, TerminalSquare, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CHARACTERS } from '../data/characters';

interface BottomInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  activeCharId: string;
  onSelectChar: (id: string) => void;
  onOpenSidebar: () => void;
}

export function BottomInput({ onSend, isStreaming, activeCharId, onSelectChar, onOpenSidebar }: BottomInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeChar = CHARACTERS.find(c => c.id === activeCharId) || CHARACTERS[0];
  const shortName = activeChar ? activeChar.name.split(' ')[0].replace(/["']/g, '') : 'SYS'; // Get first word/callsign

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      onSend(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.blur();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background/80 via-background/40 to-transparent pb-8 pt-16 px-6 pointer-events-none transition-colors duration-300">
      <div className="mx-auto max-w-3xl pointer-events-auto">
        
        {/* Quick Actions & Character Tabs */}
        <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
          
          {/* Character Quick Switcher Tabs */}
          <div className="flex gap-1.5 overflow-x-auto max-w-full custom-scrollbar pb-1">
            {CHARACTERS.map(char => {
              const isActive = char.id === activeCharId;
              const charShortName = char.name.split(' ')[0].replace(/["']/g, '');
              return (
                <button
                  key={char.id}
                  onClick={() => {
                    onSelectChar(char.id);
                    onOpenSidebar();
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-all clip-corner-sm border whitespace-nowrap shrink-0 ${
                    isActive 
                      ? 'bg-primary/20 text-primary border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)]' 
                      : 'bg-surface/80 text-primary/50 border-primary/30 hover:bg-primary/10 hover:text-primary/80'
                  }`}
                  title={char.name}
                >
                  <div className={`w-1.5 h-1.5 ${char.status === '活跃' ? 'bg-primary animate-pulse' : char.status === '待命' ? 'bg-yellow-500/50' : 'bg-red-500/50'}`}></div>
                  {charShortName}
                </button>
              );
            })}
          </div>

          {/* Quick Actions (Regenerate, Swipe) */}
          <div className="flex items-center gap-2 shrink-0">
            <button className="group flex items-center gap-2 clip-corner-sm border border-primary/50 bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary/70 transition-all hover:bg-primary/10 hover:text-primary backdrop-blur-md">
              <ArrowLeftRight size={12} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">SWITCH_NODE</span>
            </button>
            <button className="group flex items-center gap-2 clip-corner-sm border border-primary/50 bg-surface/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary/70 transition-all hover:bg-primary/10 hover:text-primary backdrop-blur-md">
              <RefreshCcw size={12} className="transition-transform duration-500 group-hover:rotate-180" />
              <span className="hidden sm:inline">RE-SYNC</span>
            </button>
          </div>
        </div>

        {/* Input Box - HUD Cyberpunk Style */}
          <motion.div 
          animate={{ 
            boxShadow: isFocused 
              ? '0 0 30px var(--shadow-color), inset 0 0 15px var(--shadow-color)' 
              : '0 10px 30px var(--shadow-color)',
            borderColor: isFocused ? 'var(--primary)' : 'color-mix(in srgb, var(--primary) 30%, transparent)'
          }}
          className="relative flex items-end gap-3 clip-corner bg-surface/40 backdrop-blur-2xl p-1 border border-primary/30 transition-all duration-300"
        >
          {/* Decorative Corner Squares */}
          <div className="hud-deco absolute top-0 left-0 w-1.5 h-1.5 bg-primary"></div>
          <div className="hud-deco absolute bottom-0 right-0 w-1.5 h-1.5 bg-primary"></div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center text-primary/60 bg-primary/5 border-r border-primary/20">
            <Target size={20} className={isFocused ? "animate-spin text-primary" : ""} strokeWidth={1.5} />
          </div>
          
          <div className="flex-1 flex items-center relative min-h-[48px] py-3.5">
            <span className="font-mono text-primary/80 mr-2 select-none text-xs">[{shortName}]&gt;</span>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="AWAITING_COMMAND..."
              disabled={isStreaming}
              className="max-h-[200px] w-full resize-none bg-transparent font-mono text-sm text-foreground placeholder:text-primary/30 placeholder:tracking-widest focus:outline-none disabled:opacity-50"
              rows={1}
            />
            {isFocused && !input && (
              <span className="absolute left-[80px] w-2 h-4 bg-primary animate-pulse pointer-events-none"></span>
            )}
          </div>
          
          <AnimatePresence>
            {input.trim() && !isStreaming && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={handleSend}
                className="flex h-10 w-12 shrink-0 items-center justify-center bg-primary text-background hover:bg-primary/80 transition-colors mr-1 mb-1 clip-corner-sm"
              >
                <Send size={16} className="translate-x-[1px]" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
