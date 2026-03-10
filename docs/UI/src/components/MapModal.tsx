import { motion, AnimatePresence } from 'motion/react';
import { X, Map as MapIcon, ShieldAlert, DoorOpen, Diamond, Building2 } from 'lucide-react';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MapModal({ isOpen, onClose }: MapModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-background/40 backdrop-blur-md p-4 sm:p-6"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-5xl max-h-[90vh] flex flex-col bg-surface/40 backdrop-blur-2xl border border-primary/30 shadow-[0_10px_40px_var(--shadow-color)] clip-corner"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center bg-primary/20 text-primary">
                <MapIcon size={18} />
              </div>
              <div>
                <h2 className="font-mono text-lg font-bold tracking-widest text-primary text-glow">战术地图</h2>
                <div className="font-mono text-[10px] text-primary/50">区域概览 // 平面图</div>
              </div>
            </div>
            <button onClick={onClose} className="text-primary/50 hover:text-primary transition-colors p-1">
              <X size={20} />
            </button>
          </div>

          {/* Map Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-6 relative">
            {/* Decorative Grid Background */}
            <div className="absolute inset-0 pointer-events-none opacity-10 tech-grid"></div>

            {/* Top Section: Two columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
              
              {/* Entrance / Decon */}
              <div className="border border-primary/30 bg-primary/5 p-4 relative clip-corner-sm">
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>
                
                <div className="flex items-center justify-between mb-4 border-b border-primary/20 pb-2">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <DoorOpen size={16} />
                    <span className="tracking-widest">玄关·净化区</span>
                  </div>
                  <span className="font-mono text-[10px] text-primary/60 border border-primary/30 px-2 py-0.5 bg-primary/10">出入缓冲 / 临时接待</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <RoomCard name="玄关" status="就绪" active />
                  <RoomCard name="客房A" status="空置" />
                  <RoomCard name="客房B" status="空置" />
                  <RoomCard name="客房C" status="空置" />
                  <RoomCard name="客房D" status="空置" />
                  <RoomCard name="客房E" status="空置" />
                </div>
              </div>

              {/* Core Living Area */}
              <div className="border border-primary/30 bg-primary/5 p-4 relative clip-corner-sm">
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>

                <div className="flex items-center justify-between mb-4 border-b border-primary/20 pb-2">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <Diamond size={16} />
                    <span className="tracking-widest">核心生活区</span>
                  </div>
                  <span className="font-mono text-[10px] text-primary/60 border border-primary/30 px-2 py-0.5 bg-primary/10">主要功能房间</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <RoomCard name="客厅" />
                  <RoomCard name="餐厅/厨房" />
                  <RoomCard name="主卧" />
                  <RoomCard name="小影院&舞台" />
                  <RoomCard name="会议室" />
                  <RoomCard name="次卧" />
                </div>
              </div>

            </div>

            {/* Bottom Section: Corridor */}
            <div className="border border-primary/30 bg-primary/5 p-4 relative clip-corner-sm z-10">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>

              <div className="flex items-center justify-between mb-4 border-b border-primary/20 pb-2">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <Building2 size={16} />
                  <span className="tracking-widest text-glow">20层 - 公寓走廊</span>
                </div>
              </div>

              {/* Warning Banner */}
              <div className="mb-4 border border-primary/50 bg-primary/20 px-3 py-2 font-mono text-xs text-primary flex items-center gap-2 shadow-[0_0_10px_rgba(var(--primary-rgb),0.2)]">
                <ShieldAlert size={14} className="animate-pulse" />
                <span>[SYS.WARN] 庇护范围未解锁（庇护所等级3解锁）。当前可用庇护 0/0。</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <RoomCard name="2001" desc="小哥哥" active />
                <RoomCard name="2002" desc="相田哲也、浅见亚..." active />
                <RoomCard name="2003" desc="星野琉璃、林月华..." active />
                <RoomCard name="2004" desc="早川遥、早川舞..." active />
                <RoomCard name="2005" desc="藤井雪乃、中村惠..." active />
                <RoomCard name="2006" desc="陈雪、陈幺妹、王静" active />
              </div>
            </div>

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function RoomCard({ name, status, desc, active }: { name: string, status?: string, desc?: string, active?: boolean }) {
  return (
    <div className={`flex flex-col justify-between p-3 border transition-all hover:bg-primary/20 cursor-pointer clip-corner-sm ${
      active 
        ? 'border-primary/60 bg-primary/10 shadow-[0_0_10px_rgba(var(--primary-rgb),0.15)]' 
        : 'border-primary/20 bg-surface/40 hover:border-primary/40'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-1.5 h-1.5 ${active ? 'bg-primary animate-pulse shadow-[0_0_5px_rgba(var(--primary-rgb),0.8)]' : 'bg-primary/30'}`}></div>
        <span className={`font-bold text-sm tracking-wide ${active ? 'text-primary' : 'text-primary/70'}`}>{name}</span>
      </div>
      {(status || desc) && (
        <div className={`text-xs text-right mt-auto font-mono truncate ${active ? 'text-primary/80' : 'text-primary/40'}`} title={desc || status}>
          {desc || status}
        </div>
      )}
    </div>
  );
}
