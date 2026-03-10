import { useState, useCallback, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { TranscriptList } from './components/TranscriptList';
import { BottomInput } from './components/BottomInput';
import { UIShowcase } from './components/UIShowcase';
import { CharacterSidebar } from './components/CharacterSidebar';
import { RadialMenu } from './components/RadialMenu';
import { TasksModal } from './components/TasksModal';
import { MapModal } from './components/MapModal';
import { TypographySettingsModal } from './components/TypographySettingsModal';
import { TypographyProvider } from './contexts/TypographyContext';
import { Message, Density } from './types';
import { CHARACTERS } from './data/characters';

// Mock initial data to show the UI state
const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg-1',
    role: 'system',
    content: '对话记录已初始化。第 0 层工作台已激活。',
    timestamp: Date.now() - 100000,
  },
  {
    id: 'msg-2',
    role: 'user',
    content: '你能总结一下我们刚才讨论的那个章节的核心主题吗？',
    timestamp: Date.now() - 60000,
  },
  {
    id: 'msg-3',
    role: 'assistant',
    content: '当然可以。上一章主要探讨了个人意志与系统性约束之间的张力。\n\n我们看到主角在僵化的社会结构中挣扎，这与城市建筑那种冷酷、几何化的描写形成了完美的呼应。它提出了一个深刻的哲学问题：在预设的框架内，真正的自由是否可能存在。',
    timestamp: Date.now() - 50000,
    meta: {
      tokens: 64,
      timeMs: 1240,
      model: 'claude-3-opus',
      raw: '{"status":"ok","data":{"themes":["个人意志 vs 系统结构","建筑隐喻","哲学层面的自由"]}}'
    }
  }
];

function AppContent() {
  const [density, setDensity] = useState<Density>('comfortable');
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [isStreaming, setIsStreaming] = useState(false);
  const [theme, setTheme] = useState<'tech' | 'dark' | 'gold' | 'ios' | 'ipod' | 'amber'>('tech');
  const [showUIShowcase, setShowUIShowcase] = useState(false);
  const [activeCharId, setActiveCharId] = useState<string>(CHARACTERS[0]?.id || '');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isTypographyOpen, setIsTypographyOpen] = useState(false);

  // Apply theme to HTML element
  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-gold', 'theme-ios', 'theme-ipod', 'theme-amber');
    if (theme !== 'tech') {
      document.documentElement.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  // Simulate the "generate({ should_stream: true })" business logic
  const handleSend = useCallback((text: string) => {
    // 1. Create real user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    // 2. Create placeholder assistant message
    const assistantId = `ast-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // 3. Simulate streaming tokens
    const responseText = "这个视角非常迷人。如果我们顺着这条线索深入，建筑的隐喻还可以延伸得更远。\n\n想想那些狭窄的小巷是如何迫使角色们发生意外邂逅的，它们就像是命运的物理具象化。我认为我们接下来应该探讨作者是如何利用空间设计来主导叙事节奏的。";
    let currentIndex = 0;

    const streamInterval = setInterval(() => {
      currentIndex += Math.floor(Math.random() * 4) + 1; // Random chunk size
      
      if (currentIndex >= responseText.length) {
        clearInterval(streamInterval);
        
        // 4. Finalize message (simulate reading from real chat history)
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === assistantId 
              ? { 
                  ...msg, 
                  content: responseText, 
                  isStreaming: false,
                  meta: {
                    tokens: 89,
                    timeMs: 1850,
                    model: 'claude-3-opus',
                    raw: '{"status":"success","generated_text":"..."}'
                  }
                } 
              : msg
          )
        );
        setIsStreaming(false);
      } else {
        // Update streaming content
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === assistantId 
              ? { ...msg, content: responseText.slice(0, currentIndex) } 
              : msg
          )
        );
      }
    }, 40); // Smooth typing effect

  }, []);

  return (
    <div className="flex h-screen w-full flex-col text-foreground font-sans overflow-hidden selection:bg-primary/40 transition-colors duration-300 relative" style={{ background: 'var(--bg-gradient)' }}>
      {/* High-Tech HUD Background */}
      <div className="pointer-events-none absolute inset-0 z-0 tech-grid opacity-30"></div>
      <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--background)_100%)]"></div>

      {/* Decorative Sidebars (HUD Sci-Fi) */}
      <div className="hud-deco pointer-events-none absolute left-4 top-20 bottom-24 w-12 hidden xl:flex flex-col justify-between py-4 z-10">
        <div className="w-full h-32 border-l-2 border-t-2 border-primary/40 clip-corner-sm relative">
          <div className="absolute top-2 left-2 w-2 h-2 bg-primary animate-pulse"></div>
          <div className="absolute -right-4 top-0 font-mono text-[8px] text-primary/60 tracking-widest" style={{ writingMode: 'vertical-rl' }}>SYS.OP.01</div>
        </div>
        <div className="flex flex-col gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="w-full h-1 bg-primary/20" style={{ width: `${Math.random() * 100}%` }}></div>
          ))}
        </div>
        <div className="w-full h-32 border-l-2 border-b-2 border-primary/40 clip-corner-sm relative">
          <div className="absolute bottom-2 left-2 font-mono text-[10px] text-primary/80">0x99</div>
        </div>
      </div>
      
      <div className="hud-deco pointer-events-none absolute right-4 top-20 bottom-24 w-12 hidden xl:flex flex-col items-end justify-between py-4 z-10">
        <div className="w-full h-32 border-r-2 border-t-2 border-primary/40 clip-corner-sm relative">
          <div className="absolute top-2 right-2 w-2 h-2 bg-primary animate-pulse"></div>
          <div className="absolute -left-4 top-0 font-mono text-[8px] text-primary/60 tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>NET.UPLINK</div>
        </div>
        <div className="w-8 h-8 rounded-full border border-primary/40 flex items-center justify-center relative">
          <div className="w-6 h-6 rounded-full border border-primary/20 border-t-primary animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[8px] text-primary">OK</div>
        </div>
        <div className="w-full h-32 border-r-2 border-b-2 border-primary/40 clip-corner-sm relative">
          <div className="absolute bottom-2 right-2 font-mono text-[10px] text-primary/80">88%</div>
        </div>
      </div>

      {/* Top Bar (Density & Controls) */}
      <TopBar 
        density={density} 
        setDensity={setDensity} 
        theme={theme} 
        setTheme={setTheme} 
        onOpenShowcase={() => setShowUIShowcase(true)}
        onOpenTasks={() => setIsTasksOpen(true)}
        onOpenMap={() => setIsMapOpen(true)}
        onOpenTypography={() => setIsTypographyOpen(true)}
      />

      {/* Character Sidebar (Collapsible) */}
      <CharacterSidebar 
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        activeCharId={activeCharId} 
        onSelectChar={setActiveCharId} 
      />

      {/* Main Transcript Area */}
      <TranscriptList messages={messages} density={density} />

      {/* Bottom Input Area */}
      <BottomInput 
        onSend={handleSend} 
        isStreaming={isStreaming} 
        activeCharId={activeCharId}
        onSelectChar={setActiveCharId}
        onOpenSidebar={() => setIsSidebarOpen(true)}
      />

      {/* Radial Menu for Character Switching */}
      <RadialMenu
        activeCharId={activeCharId}
        onSelectChar={setActiveCharId}
        onOpenSidebar={() => setIsSidebarOpen(true)}
      />

      {/* UI Component Showcase Modal */}
      <UIShowcase isOpen={showUIShowcase} onClose={() => setShowUIShowcase(false)} />

      {/* Tasks Modal */}
      <TasksModal isOpen={isTasksOpen} onClose={() => setIsTasksOpen(false)} />

      {/* Map Modal */}
      <MapModal isOpen={isMapOpen} onClose={() => setIsMapOpen(false)} />

      {/* Typography Settings Modal */}
      <TypographySettingsModal isOpen={isTypographyOpen} onClose={() => setIsTypographyOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <TypographyProvider>
      <AppContent />
    </TypographyProvider>
  );
}

