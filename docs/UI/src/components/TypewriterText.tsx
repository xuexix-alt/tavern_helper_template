import { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  isStreaming?: boolean;
}

export function TypewriterText({ text, speed = 20, isStreaming = false }: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState(isStreaming ? text : '');
  const currentIndex = useRef(0);

  useEffect(() => {
    if (isStreaming) {
      setDisplayedText(text);
      currentIndex.current = text.length;
      return;
    }

    // If text is already fully displayed, don't restart
    if (currentIndex.current >= text.length) {
      setDisplayedText(text);
      return;
    }

    const timer = setInterval(() => {
      if (currentIndex.current < text.length) {
        setDisplayedText((prev) => prev + text.charAt(currentIndex.current));
        currentIndex.current++;
      } else {
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, isStreaming]);

  return <>{displayedText}</>;
}
