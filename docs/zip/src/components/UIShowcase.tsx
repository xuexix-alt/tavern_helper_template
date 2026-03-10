import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, Terminal, Shield, Database, Cpu } from 'lucide-react';
import { useState } from 'react';

interface UIShowcaseProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UIShowcase({ isOpen, onClose }: UIShowcaseProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedOption, setSelectedOption] = useState('节点_阿尔法');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 sm:px-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
          />

          {/* Modal Container (Glassmorphism + HUD) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl hud-panel bg-surface/80 backdrop-blur-xl soft-shadow border-primary/50 overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-primary/30 bg-primary/5 px-6 py-4">
              <div className="flex items-center gap-3 font-mono text-primary text-glow">
                <Terminal size={18} />
                <span className="tracking-widest font-bold">[ UI_组件库 ]</span>
              </div>
              <button
                onClick={onClose}
                className="text-primary/60 hover:text-primary hover:bg-primary/10 p-1 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              
              {/* 1. Dropdown Menu Example */}
              <section className="space-y-3">
                <h3 className="font-mono text-xs text-primary/60 uppercase tracking-widest flex items-center gap-2">
                  <Database size={12} /> 数据路由选择
                </h3>
                <div className="relative w-64">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full flex items-center justify-between border border-primary/40 bg-surface/50 px-4 py-2 font-mono text-sm text-foreground hover:bg-primary/10 transition-colors"
                  >
                    <span>{selectedOption}</span>
                    <motion.div animate={{ rotate: isDropdownOpen ? 180 : 0 }}>
                      <ChevronDown size={16} className="text-primary" />
                    </motion.div>
                  </button>

                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute top-full left-0 mt-1 w-full border border-primary/30 bg-surface/90 backdrop-blur-md soft-shadow z-50"
                      >
                        {['节点_阿尔法', '节点_贝塔', '安全飞地', '外部中继'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setSelectedOption(opt);
                              setIsDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 font-mono text-sm text-foreground/80 hover:bg-primary/20 hover:text-primary transition-colors"
                          >
                            &gt; {opt}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              {/* 2. Expandable Border / Accordion Example */}
              <section className="space-y-3">
                <h3 className="font-mono text-xs text-primary/60 uppercase tracking-widest flex items-center gap-2">
                  <Shield size={12} /> 安全协议
                </h3>
                <div className="border border-primary/30 bg-surface/30">
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/10 transition-colors"
                  >
                    <span className="font-mono text-sm text-primary">查看高级诊断</span>
                    <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                      <ChevronDown size={16} className="text-primary" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 border-t border-primary/20 bg-background/50 font-mono text-xs text-foreground/70 space-y-2">
                          <p>&gt; 防火墙状态: <span className="text-green-500">最佳</span></p>
                          <p>&gt; 入侵检测: <span className="text-primary">未发现</span></p>
                          <p>&gt; 加密级别: 抗量子_AES256</p>
                          <div className="h-1 w-full bg-primary/20 mt-2 overflow-hidden">
                            <motion.div 
                              className="h-full bg-primary"
                              animate={{ width: ['0%', '100%'] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              {/* 3. Form / Input Menu Example */}
              <section className="space-y-3">
                <h3 className="font-mono text-xs text-primary/60 uppercase tracking-widest flex items-center gap-2">
                  <Cpu size={12} /> 系统配置
                </h3>
                <div className="p-5 border border-primary/30 bg-surface/40 space-y-4 relative">
                  {/* Decorative corner brackets */}
                  <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary"></div>
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary"></div>

                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-primary/70 uppercase">覆盖代码</label>
                    <input 
                      type="text" 
                      placeholder="输入访问代码..." 
                      className="w-full bg-background/50 border border-primary/30 px-3 py-2 font-mono text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-foreground/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[10px] text-primary/70 uppercase">功率分配</label>
                    <div className="flex gap-4">
                      {['最低', '平衡', '最高'].map((level) => (
                        <label key={level} className="flex items-center gap-2 cursor-pointer group">
                          <div className="relative flex items-center justify-center w-4 h-4 border border-primary/50 group-hover:border-primary transition-colors">
                            <input type="radio" name="power" className="peer sr-only" defaultChecked={level === '平衡'} />
                            <div className="w-2 h-2 bg-primary opacity-0 peer-checked:opacity-100 transition-opacity"></div>
                          </div>
                          <span className="font-mono text-xs text-foreground/70 group-hover:text-primary transition-colors">{level}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button className="w-full py-2 bg-primary/10 border border-primary text-primary font-mono text-sm hover:bg-primary hover:text-background transition-all text-glow hover:shadow-[0_0_15px_var(--primary)]">
                      初始化序列
                    </button>
                  </div>
                </div>
              </section>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
