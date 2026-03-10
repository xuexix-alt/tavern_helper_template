import { motion, AnimatePresence } from 'motion/react';
import { X, CheckSquare, Clock, AlertCircle } from 'lucide-react';

interface TasksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TASKS = [
  { id: 'T-01', title: '调查第四区能源泄漏', status: '进行中', progress: 65, type: '主线', priority: '高', desc: '第四区出现异常能量波动，疑似反应堆冷却系统故障。需要派人前往确认。' },
  { id: 'T-02', title: '修复通讯阵列', status: '待处理', progress: 0, type: '主线', priority: '紧急', desc: '主通讯天线受损，无法与外部取得联系。必须在风暴来临前修复。' },
  { id: 'T-03', title: '收集神经突触样本', status: '已完成', progress: 100, type: '支线', priority: '普通', desc: '为了推进Project Chimera，需要从变异体身上提取新鲜的神经样本。' },
  { id: 'T-04', title: '破解安保终端', status: '进行中', progress: 32, type: '支线', priority: '高', desc: '获取B区实验室的访问权限。防火墙正在反追踪，需要加快速度。' },
];

export function TasksModal({ isOpen, onClose }: TasksModalProps) {
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
          className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-surface/40 backdrop-blur-2xl border border-primary/30 shadow-[0_10px_40px_var(--shadow-color)] clip-corner"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-primary/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center bg-primary/20 text-primary">
                <CheckSquare size={18} />
              </div>
              <div>
                <h2 className="font-mono text-lg font-bold tracking-widest text-primary text-glow">当前任务</h2>
                <div className="font-mono text-[10px] text-primary/50">系统目标 // 概览</div>
              </div>
            </div>
            <button onClick={onClose} className="text-primary/50 hover:text-primary transition-colors p-1">
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-4">
            {TASKS.map(task => (
              <div key={task.id} className={`relative border p-4 transition-all ${task.status === '已完成' ? 'border-primary/20 bg-surface/50 opacity-60' : task.status === '进行中' ? 'border-primary/50 bg-primary/5 shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]' : 'border-primary/30 bg-surface'}`}>
                {/* Decorative corner */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary/50"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary/50"></div>

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20">{task.id}</span>
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 border ${task.type === '主线' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' : 'bg-blue-500/10 text-blue-500 border-blue-500/30'}`}>{task.type}</span>
                      {task.priority === '紧急' && <span className="font-mono text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-500 border border-red-500/30 animate-pulse">紧急</span>}
                    </div>
                    <h3 className={`font-bold text-lg mb-1 ${task.status === '已完成' ? 'line-through text-primary/50' : 'text-foreground'}`}>{task.title}</h3>
                    <p className="text-sm text-primary/60 mb-4">{task.desc}</p>
                  </div>

                  <div className="sm:w-48 shrink-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-primary/50">状态</span>
                      <span className={task.status === '已完成' ? 'text-green-500' : task.status === '进行中' ? 'text-primary' : 'text-primary/50'}>
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-primary/10 overflow-hidden">
                      <div className={`h-full ${task.status === '已完成' ? 'bg-green-500' : 'bg-primary'} transition-all duration-1000`} style={{ width: `${task.progress}%` }}></div>
                    </div>
                    <div className="text-right font-mono text-[10px] text-primary/70">{task.progress}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
