import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Cpu, Clock, ChevronDown, AlignLeft, AlertTriangle, Target } from 'lucide-react';
import { Message, Density } from '../types';
import { TypewriterText } from './TypewriterText';
import { useTypography } from '../contexts/TypographyContext';

interface MessageItemProps {
  message: Message;
  density: Density;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, density }) => {
  const [showMeta, setShowMeta] = useState(false);
  const { typography } = useTypography();
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  // Density-based styling
  const paddingClass = 
    density === 'comfortable' ? 'py-8 px-6' : 
    density === 'compact' ? 'py-4 px-6' : 'py-2 px-4';
  
  // Typography settings mapping
  const fontClassMap = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  };
  
  const sizeClassMap = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };

  const leadingClassMap = {
    tight: 'leading-tight',
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
    loose: 'leading-loose',
  };

  const fontClass = fontClassMap[typography.fontFamily];
  const sizeClass = sizeClassMap[typography.fontSize];
  const leadingClass = leadingClassMap[typography.lineHeight];

  if (isSystem) {
    return (
      <div className="flex w-full justify-center py-6">
        <div className="relative border border-primary/50 bg-surface/80 px-8 py-3 font-mono text-xs tracking-widest text-primary uppercase clip-corner-sm overflow-hidden flex items-center gap-3">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/50"></div>
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-primary/50"></div>
          <AlertTriangle size={14} className="animate-pulse" />
          <span>[ SYS_ALERT ] <TypewriterText text={message.content} speed={30} /></span>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="w-full flex justify-end my-4 pl-12 pr-4"
      >
        <div className="user-message-bubble font-mono text-sm text-primary/90 text-right break-words max-w-2xl bg-primary/5 border-r-2 border-primary/50 pr-4 py-2 relative">
          <div className="user-message-deco absolute top-0 right-0 w-2 h-[1px] bg-primary/50"></div>
          <div className="user-message-deco absolute bottom-0 right-0 w-2 h-[1px] bg-primary/50"></div>
          <span>{message.content}</span>
        </div>
      </motion.div>
    );
  }

  // Assistant Message (HUD Cyberpunk)
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`group relative flex w-full flex-col ${paddingClass} transition-colors duration-500`}
    >
      <div className={`flex w-full max-w-3xl flex-col gap-3 items-start relative hud-panel p-6 sm:p-8 clip-corner`}>
        
        {/* Crosshairs */}
        <div className="crosshair-tl"></div>
        <div className="crosshair-tr"></div>
        <div className="crosshair-bl"></div>
        <div className="crosshair-br"></div>

        {/* HUD Label / Data Block Header */}
        <div className="absolute -top-3 left-6 bg-background px-3 font-mono text-[10px] text-primary tracking-widest uppercase flex items-center gap-3 border border-primary/30">
          <Target size={10} className={message.isStreaming ? "animate-spin" : ""} />
          {message.isStreaming ? 'PROCESSING_DATA_STREAM...' : 'DATA_MODULE_SECURE'}
          <span className="opacity-40">|</span>
          <span className="opacity-60">ID: {message.id.substring(0,6).toUpperCase()}</span>
        </div>

        {/* Content Bubble */}
        <div className="relative w-full mt-2">
          <div className={`whitespace-pre-wrap break-words ${fontClass} ${sizeClass} ${leadingClass} text-foreground tracking-wide transition-all duration-300`}>
            <TypewriterText text={message.content} isStreaming={message.isStreaming} speed={15} />
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse align-middle" />
            )}
          </div>
        </div>

        {/* Meta / Detail Toggle */}
        {message.meta && density !== 'minimal' && !message.isStreaming && (
          <div className="mt-4 flex flex-col gap-3 w-full border-t border-primary/20 pt-4">
            <button 
              onClick={() => setShowMeta(!showMeta)}
              className="group flex w-fit items-center gap-1.5 border border-primary/30 bg-surface/50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary/60 transition-all hover:bg-primary/10 hover:text-primary clip-corner-sm"
            >
              <motion.div animate={{ rotate: showMeta ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={12} strokeWidth={2} />
              </motion.div>
              <span>{showMeta ? '[ HIDE_DIAGNOSTICS ]' : '[ SHOW_DIAGNOSTICS ]'}</span>
            </button>
            
            <AnimatePresence>
              {showMeta && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-4 border border-primary/20 bg-background/80 p-4 font-mono text-xs relative clip-corner-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/30"></div>
                    
                    {/* Metrics Row */}
                    <div className="flex flex-wrap gap-6 text-primary/80 pl-2">
                      {message.meta.model && (
                        <div className="flex items-center gap-2">
                          <Cpu size={12} className="text-primary/50" />
                          <span className="opacity-50">MODEL:</span>
                          <span>{message.meta.model}</span>
                        </div>
                      )}
                      {message.meta.timeMs && (
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-primary/50" />
                          <span className="opacity-50">LATENCY:</span>
                          <span>{message.meta.timeMs}ms</span>
                        </div>
                      )}
                      {message.meta.tokens && (
                        <div className="flex items-center gap-2">
                          <AlignLeft size={12} className="text-primary/50" />
                          <span className="opacity-50">TOKENS:</span>
                          <span>{message.meta.tokens}</span>
                        </div>
                      )}
                    </div>

                    {/* Raw Output Section */}
                    {message.meta.raw && (
                      <div className="w-full border-t border-primary/20 pt-3 mt-1 pl-2">
                        <span className="mb-2 block text-[10px] opacity-50 tracking-widest">
                          &gt; RAW_OUTPUT_DUMP:
                        </span>
                        <div className="bg-surface/50 p-3 border border-primary/10 clip-corner-sm">
                          <code className="block whitespace-pre-wrap text-[10px] leading-relaxed text-primary/70">
                            {message.meta.raw}
                          </code>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
