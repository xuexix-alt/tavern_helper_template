import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ChevronRight, Shield, Zap, Target, Dices, Hourglass, Lock, Activity, Wrench, Truck, Cpu } from 'lucide-react';
import { Character, CHARACTERS } from '../data/characters';

interface CharacterSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeCharId: string;
  onSelectChar: (id: string) => void;
}

export function CharacterSidebar({ isOpen, setIsOpen, activeCharId, onSelectChar }: CharacterSidebarProps) {
  const [activeTab, setActiveTab] = useState<'characters' | 'system'>('characters');

  return (
    <>
      {/* Backdrop for mobile and desktop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`absolute left-0 top-1/2 -translate-y-1/2 z-[60] flex h-24 w-6 items-center justify-center border border-l-0 border-primary/30 bg-background/40 backdrop-blur-xl shadow-[4px_0_15px_var(--shadow-color)] text-primary hover:bg-primary/20 hover:text-glow transition-all clip-corner-sm ${isOpen ? 'translate-x-[320px]' : 'translate-x-0'}`}
        style={{ transitionDuration: '400ms' }}
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronRight size={16} />
        </motion.div>
        <div className="absolute -right-8 font-mono text-[10px] tracking-widest text-primary/50" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          [ ROSTER ]
        </div>
      </button>

      {/* Sidebar Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute left-0 top-14 bottom-0 w-[320px] z-50 border-r border-primary/20 bg-background/40 backdrop-blur-2xl shadow-[4px_0_30px_var(--shadow-color)] flex flex-col clip-corner"
          >
            {/* Header with Tabs */}
            <div className="flex border-b border-primary/20 shrink-0">
              <button
                onClick={() => setActiveTab('characters')}
                className={`flex-1 p-4 flex items-center justify-center gap-2 font-mono text-xs tracking-widest transition-colors ${activeTab === 'characters' ? 'text-primary bg-primary/10 border-b-2 border-primary' : 'text-primary/50 hover:text-primary/80 hover:bg-primary/5'}`}
              >
                <Users size={16} />
                <span className="font-bold">AGENTS</span>
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`flex-1 p-4 flex items-center justify-center gap-2 font-mono text-xs tracking-widest transition-colors ${activeTab === 'system' ? 'text-primary bg-primary/10 border-b-2 border-primary' : 'text-primary/50 hover:text-primary/80 hover:bg-primary/5'}`}
              >
                <Cpu size={16} />
                <span className="font-bold">SYSTEM</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
              {activeTab === 'characters' ? (
                // Character List (Accordion Style)
                <div className="flex flex-col gap-2 animate-in fade-in duration-300">
                  {CHARACTERS.map((char) => {
                    const isActive = activeCharId === char.id;
                    return (
                      <div 
                        key={char.id}
                        className={`border transition-all duration-300 ${isActive ? 'border-primary/50 bg-primary/5' : 'border-primary/10 bg-surface/30 hover:border-primary/30'}`}
                      >
                        {/* Accordion Header */}
                        <button
                          onClick={() => onSelectChar(char.id)}
                          className="w-full flex items-center justify-between p-3 text-left hover:bg-primary/5 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 ${char.status === '活跃' ? 'bg-primary animate-pulse' : char.status === '待命' ? 'bg-yellow-500/50' : 'bg-red-500/50'}`}></div>
                            <span className={`font-mono text-xs tracking-wider ${isActive ? 'text-primary' : 'text-primary/60'}`}>
                              {char.name}
                            </span>
                          </div>
                          <motion.div animate={{ rotate: isActive ? 90 : 0 }}>
                            <ChevronRight size={14} className={isActive ? 'text-primary' : 'text-primary/40'} />
                          </motion.div>
                        </button>

                        {/* Accordion Content */}
                        <AnimatePresence>
                          {isActive && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-3 pt-0 border-t border-primary/10 mt-1 flex flex-col gap-4">
                                
                                {/* Role & Status */}
                                <div className="flex justify-between items-center mt-3">
                                  <span className="font-mono text-[10px] text-primary/50 border border-primary/20 px-2 py-0.5">
                                    职业: {char.role}
                                  </span>
                                  <span className="font-mono text-[10px] text-primary/50">
                                    编号: {char.id.split('-')[1]}
                                  </span>
                                </div>

                                {/* Stats Radar/Bars */}
                                <div className="flex flex-col gap-2">
                                  <StatBar icon={<Shield size={10} />} label="力量" value={char.stats.str} />
                                  <StatBar icon={<Zap size={10} />} label="智力" value={char.stats.int} />
                                  <StatBar icon={<Target size={10} />} label="敏捷" value={char.stats.agi} />
                                </div>

                                {/* Bio */}
                                <div className="relative p-2 border border-primary/20 bg-background/50 mt-2">
                                  <div className="absolute top-0 left-0 w-1 h-full warning-stripe opacity-30"></div>
                                  <p className="font-serif text-xs text-foreground/80 leading-relaxed pl-2">
                                    {char.description}
                                  </p>
                                </div>

                                {/* Action Button */}
                                <button className="w-full py-1.5 border border-primary/40 bg-primary/10 font-mono text-[10px] tracking-widest text-primary hover:bg-primary hover:text-background transition-colors mt-2 clip-corner-sm">
                                  [ INIT_CONNECTION ]
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // System Tab Content
                <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Top Stats */}
                  <div className="flex flex-col gap-3">
                    {/* Shelter Level */}
                    <div className="border border-primary/30 bg-surface/50 p-3 clip-corner-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"></div>
                      <div className="flex items-center gap-2 text-primary/70 mb-1">
                        <Shield size={14} className="text-yellow-500" />
                        <span className="font-mono text-xs font-bold">庇护所等级</span>
                      </div>
                      <div className="text-2xl font-bold text-primary font-mono ml-1">
                        7 <span className="text-sm text-primary/50 font-normal">级</span>
                      </div>
                    </div>

                    {/* Dice Roll */}
                    <div className="border border-primary/30 bg-surface/50 p-3 clip-corner-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"></div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-primary/70">
                          <Dices size={14} className="text-blue-400" />
                          <span className="font-mono text-xs font-bold">今日投掷点数</span>
                        </div>
                        <button className="border border-primary/50 px-3 py-0.5 text-[10px] font-mono text-primary hover:bg-primary hover:text-background transition-colors rounded-full">
                          校准
                        </button>
                      </div>
                      <div className="text-sm font-bold text-primary font-mono ml-1">
                        今日已投掷: 3点 <span className="text-primary/50 font-normal">(未升级)</span>
                      </div>
                    </div>

                    {/* Upgrade Timer */}
                    <div className="border border-primary/30 bg-surface/50 p-3 clip-corner-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary/50 group-hover:bg-primary transition-colors"></div>
                      <div className="flex items-center gap-2 text-primary/70 mb-1">
                        <Hourglass size={14} className="text-orange-400" />
                        <span className="font-mono text-xs font-bold">距离上次保底升级</span>
                      </div>
                      <div className="text-sm font-bold text-primary font-mono ml-1">
                        1天 <span className="text-primary/50 mx-1">|</span> <span className="text-primary/80">剩余保底升级天数: 6天</span>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Areas */}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-primary/80 border-b border-primary/20 pb-2">
                      <Lock size={14} className="text-yellow-500" />
                      <span className="font-mono text-xs font-bold tracking-widest">可扩展区域状态</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {/* Medical Wing */}
                      <div className="border border-primary/30 bg-surface/30 p-3 flex flex-col items-center justify-center gap-2 hover:border-primary/60 transition-colors clip-corner-sm">
                        <div className="flex items-center gap-2 text-primary/80">
                          <Activity size={14} className="text-purple-400" />
                          <span className="font-mono text-sm font-bold">医疗翼</span>
                        </div>
                        <span className="font-mono text-xs text-green-400">外科手术台</span>
                      </div>

                      {/* Workshop */}
                      <div className="border border-primary/30 bg-surface/30 p-3 flex flex-col items-center justify-center gap-2 hover:border-primary/60 transition-colors clip-corner-sm">
                        <div className="flex items-center gap-2 text-primary/80">
                          <Wrench size={14} className="text-gray-400" />
                          <span className="font-mono text-sm font-bold text-gray-400">制造工坊</span>
                        </div>
                        <span className="font-mono text-xs text-red-500">未解锁</span>
                      </div>

                      {/* Vehicle Hangar */}
                      <div className="border border-primary/30 bg-surface/30 p-3 flex flex-col items-center justify-center gap-2 hover:border-primary/60 transition-colors clip-corner-sm">
                        <div className="flex items-center gap-2 text-primary/80">
                          <Truck size={14} className="text-green-500" />
                          <span className="font-mono text-sm font-bold">载具格纳库</span>
                        </div>
                        <span className="font-mono text-xs text-green-400">先驱者制造单元</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-3 border-t border-primary/20 font-mono text-[9px] text-primary/40 flex justify-between shrink-0">
              <span>DB_SYNC: OK</span>
              <span>ENTITIES: {CHARACTERS.length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function StatBar({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-primary/70">
      <div className="w-4 flex justify-center">{icon}</div>
      <span className="w-6">{label}</span>
      <div className="flex-1 h-1.5 bg-primary/10 relative overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute top-0 left-0 h-full bg-primary/60"
        />
      </div>
      <span className="w-6 text-right">{value}</span>
    </div>
  );
}
