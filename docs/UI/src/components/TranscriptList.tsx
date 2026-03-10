import React, { useEffect, useRef } from 'react';
import { Message, Density } from '../types';
import { MessageItem } from './MessageItem';
import { BookOpen } from 'lucide-react';
import { useTypography } from '../contexts/TypographyContext';

interface TranscriptListProps {
  messages: Message[];
  density: Density;
}

export function TranscriptList({ messages, density }: TranscriptListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { typography } = useTypography();

  const fontClass = {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
    outfit: 'font-outfit',
    quicksand: 'font-quicksand'
  }[typography.fontFamily];

  const sizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  }[typography.fontSize];

  const leadingClass = {
    tight: 'leading-tight',
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
    loose: 'leading-loose'
  }[typography.lineHeight];

  // Auto-scroll to bottom when messages change, especially during streaming
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      scrollRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  return (
    <div 
      ref={scrollRef}
      className={`flex-1 overflow-y-auto overflow-x-hidden scroll-smooth pb-40 pt-4 ${fontClass} ${sizeClass} ${leadingClass}`}
    >
      <div className="mx-auto flex max-w-4xl flex-col px-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center pt-40 text-foreground/40">
            <BookOpen size={48} strokeWidth={1} className="mb-6 opacity-50" />
            <div className="font-serif text-2xl italic">对话记录为空</div>
            <div className="mt-2 font-sans text-sm tracking-wide uppercase">等待您的输入以开始</div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} density={density} />
          ))
        )}
      </div>
    </div>
  );
}
