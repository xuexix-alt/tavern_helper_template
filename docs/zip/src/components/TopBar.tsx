import React from 'react';
import { motion } from 'motion/react';
import { AlignJustify, AlignLeft, Minus, Terminal, Moon, Sun, Layers, Type, Diamond } from 'lucide-react';
import { Density } from '../types';

interface TopBarProps {
  density: Density;
  setDensity: (density: Density) => void;
  theme: 'light' | 'dark' | 'gold';
  setTheme: (theme: 'light' | 'dark' | 'gold') => void;
  onOpenShowcase: () => void;
  onOpenTasks: () => void;
  onOpenMap: () => void;
  onOpenTypography: () => void;
}

export function TopBar({ density, setDensity, theme, setTheme, onOpenShowcase, onOpenTasks, onOpenMap, onOpenTypography }: TopBarProps) {
  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('gold');
    else setTheme('light');
  };

  return (
    <header className="relative z-50 flex h-14 shrink-0 items-center justify-between px-3 sm:px-6 border-b border-primary/30 bg-background/90 backdrop-blur-md">
      {/* Left: Branding / Title */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="font-mono text-primary font-bold tracking-widest text-glow flex items-center gap-2">
          <Terminal size={16} className="shrink-0" />
          <span className="hidden md:inline">[ 系统读取 // 零层 ]</span>
        </div>
      </div>

      {/* Center: Tasks & Map */}
      <div className="flex items-center gap-4 sm:gap-6 font-mono text-[10px] sm:text-xs text-primary/50">
        <button 
          onClick={onOpenTasks}
          className="flex items-center gap-1 sm:gap-2 hover:text-primary transition-colors cursor-pointer group"
        >
          <span className="font-bold tracking-widest">任务</span>
          <div className="hidden lg:flex gap-0.5">
            {[...Array(10)].map((_, i) => (
              <div key={i} className={`h-3 w-1.5 transition-colors ${i < 6 ? 'bg-primary/70 group-hover:bg-primary' : 'bg-primary/20 group-hover:bg-primary/40'}`}></div>
            ))}
          </div>
        </button>
        <button 
          onClick={onOpenMap}
          className="flex items-center gap-1 sm:gap-2 hover:text-primary transition-colors cursor-pointer group"
        >
          <span className="font-bold tracking-widest">地图</span>
          <div className="hidden lg:flex gap-0.5">
            {[...Array(10)].map((_, i) => (
              <div key={i} className={`h-3 w-1.5 transition-colors ${i < 4 ? 'bg-primary/70 group-hover:bg-primary' : 'bg-primary/20 group-hover:bg-primary/40'} ${i === 3 ? 'animate-pulse' : ''}`}></div>
            ))}
          </div>
        </button>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 sm:gap-6 font-mono text-xs">
        <div className="hidden sm:flex items-center gap-2 text-primary/70 tracking-widest">
          <span className="animate-pulse text-primary">●</span> 在线
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenShowcase}
            className="flex h-7 px-2 sm:px-3 items-center justify-center gap-2 border border-primary/30 text-primary hover:bg-primary/10 hover:text-glow transition-all clip-corner-sm"
            title="UI 组件库"
          >
            <Layers size={12} />
            <span className="hidden lg:inline">组件库</span>
          </button>

          <button
            onClick={onOpenTypography}
            className="flex h-7 px-2 sm:px-3 items-center justify-center gap-2 border border-primary/30 text-primary hover:bg-primary/10 hover:text-glow transition-all clip-corner-sm"
            title="排版设置"
          >
            <Type size={12} />
            <span className="hidden lg:inline">排版</span>
          </button>

          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center border border-primary/30 text-primary hover:bg-primary/10 hover:text-glow transition-all clip-corner-sm shrink-0"
            title="切换主题"
          >
            {theme === 'light' ? <Sun size={12} /> : theme === 'dark' ? <Moon size={12} /> : <Diamond size={12} />}
          </button>

          <div className="hidden sm:flex items-center gap-1 border border-primary/30 p-1 bg-surface/50 clip-corner-sm">
            <DensityButton
              active={density === 'comfortable'}
              onClick={() => setDensity('comfortable')}
              icon={<AlignJustify size={14} strokeWidth={1.5} />}
              label="舒适"
            />
            <DensityButton
              active={density === 'compact'}
              onClick={() => setDensity('compact')}
              icon={<AlignLeft size={14} strokeWidth={1.5} />}
              label="紧凑"
            />
            <DensityButton
              active={density === 'minimal'}
              onClick={() => setDensity('minimal')}
              icon={<Minus size={14} strokeWidth={1.5} />}
              label="极简"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

function DensityButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative flex h-6 w-8 items-center justify-center transition-colors duration-300 ${
        active ? 'text-background bg-primary' : 'text-primary/50 hover:text-primary hover:bg-primary/10'
      }`}
    >
      <span className="relative z-10">{icon}</span>
    </button>
  );
}
