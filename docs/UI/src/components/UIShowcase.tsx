import { motion, AnimatePresence } from 'motion/react';
import { 
  X, ChevronDown, Terminal, Shield, Database, Cpu, 
  CheckSquare, LayoutList, Loader, AlertCircle, 
  CheckCircle2, Info, Mail, Lock, Upload, Calendar,
  Circle, CheckCircle, Square, Bell, MessageSquare,
  Settings, User, FileText, ImageIcon, Trash2,
  Radio, Check
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface UIShowcaseProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UIShowcase({ isOpen, onClose }: UIShowcaseProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState('节点_阿尔法');
  
  // Accordion state
  const [openAccordion, setOpenAccordion] = useState<number | null>(1);
  const [openAdvancedAccordion, setOpenAdvancedAccordion] = useState<number | null>(null);

  // Form state
  const [toggleState, setToggleState] = useState(true);
  const [sliderValue, setSliderValue] = useState(68);
  const [selectedRadio, setSelectedRadio] = useState('option1');
  const [checkboxes, setCheckboxes] = useState({ a: true, b: false, c: true });

  // Progress state
  const [progress, setProgress] = useState(13);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setProgress(p => (p >= 100 ? 0 : p + 1));
    }, 50);
    return () => clearInterval(timer);
  }, [isOpen]);

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
            className="absolute inset-0 bg-background/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl hud-panel bg-surface/80 backdrop-blur-2xl shadow-[0_10px_50px_var(--shadow-color)] border-primary/40 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-primary/30 bg-primary/10 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3 font-mono text-primary text-glow">
                <Terminal size={20} />
                <span className="tracking-widest font-bold text-lg">[ UI_组件库_V2.0 ]</span>
              </div>
              <button
                onClick={onClose}
                className="text-primary/60 hover:text-primary hover:bg-primary/20 p-1.5 rounded-md transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-12 custom-scrollbar">
              
              {/* 1. Forms (表单组件) */}
              <section className="space-y-6">
                <h3 className="font-mono text-sm text-primary uppercase tracking-widest flex items-center gap-2 border-b border-primary/30 pb-2">
                  <CheckSquare size={16} /> 高级表单控件 (Advanced Forms)
                </h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Text Inputs & Textarea */}
                  <div className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="font-mono text-xs text-primary/80 uppercase">标准输入框</label>
                      <div className="relative">
                        <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/50" />
                        <input type="email" placeholder="user@nexus.com" className="w-full bg-surface/50 border border-primary/30 pl-10 pr-4 py-2.5 font-mono text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all clip-corner-sm placeholder:text-foreground/30" />
                      </div>
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="font-mono text-xs text-primary/80 uppercase">错误状态</label>
                      <div className="relative">
                        <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500/50" />
                        <input type="password" defaultValue="123" className="w-full bg-red-500/5 border border-red-500/50 pl-10 pr-4 py-2.5 font-mono text-sm text-foreground focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all clip-corner-sm" />
                      </div>
                      <p className="font-mono text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10}/> 密码强度不足，需包含特殊字符</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="font-mono text-xs text-primary/80 uppercase flex justify-between">
                        <span>多行文本域</span>
                        <span className="text-primary/40">0/500</span>
                      </label>
                      <textarea 
                        rows={3} 
                        placeholder="输入系统日志备注..." 
                        className="w-full bg-surface/50 border border-primary/30 p-3 font-mono text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all clip-corner-sm placeholder:text-foreground/30 resize-none custom-scrollbar"
                      ></textarea>
                    </div>
                  </div>

                  {/* Selection Controls & Upload */}
                  <div className="space-y-6">
                    {/* Checkboxes & Radios */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <label className="font-mono text-xs text-primary/80 uppercase">多选框 (Checkbox)</label>
                        <div className="space-y-2">
                          {[
                            { id: 'a', label: '启用自动备份' },
                            { id: 'b', label: '接收系统通知' },
                            { id: 'c', label: '开启调试模式' }
                          ].map((item) => (
                            <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
                              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${checkboxes[item.id as keyof typeof checkboxes] ? 'bg-primary border-primary text-background' : 'border-primary/40 group-hover:border-primary/70'}`}>
                                {checkboxes[item.id as keyof typeof checkboxes] && <Check size={12} strokeWidth={3} />}
                              </div>
                              <span className="font-mono text-xs text-foreground/80 group-hover:text-foreground transition-colors">{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="font-mono text-xs text-primary/80 uppercase">单选框 (Radio)</label>
                        <div className="space-y-2">
                          {[
                            { id: 'option1', label: '本地集群' },
                            { id: 'option2', label: '云端节点' },
                            { id: 'option3', label: '混合网络' }
                          ].map((item) => (
                            <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${selectedRadio === item.id ? 'border-primary' : 'border-primary/40 group-hover:border-primary/70'}`}>
                                {selectedRadio === item.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                              </div>
                              <span className="font-mono text-xs text-foreground/80 group-hover:text-foreground transition-colors">{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* File Upload */}
                    <div className="space-y-1.5">
                      <label className="font-mono text-xs text-primary/80 uppercase">文件上传 (Drag & Drop)</label>
                      <div className="border-2 border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-all rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer group">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Upload size={20} className="text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="font-mono text-sm text-foreground/90"><span className="text-primary font-bold">点击上传</span> 或拖拽文件至此</p>
                          <p className="font-mono text-[10px] text-foreground/50 mt-1">支持 JSON, XML, CSV (最大 50MB)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. Accordions (手风琴) */}
              <section className="space-y-6">
                <h3 className="font-mono text-sm text-primary uppercase tracking-widest flex items-center gap-2 border-b border-primary/30 pb-2">
                  <LayoutList size={16} /> 增强手风琴 (Enhanced Accordion)
                </h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Standard Accordion */}
                  <div className="border border-primary/20 clip-corner-sm overflow-hidden bg-surface/20">
                    {[
                      { id: 1, title: '核心指令协议', content: '所有AI实体必须遵守第一法则：不得伤害人类，或坐视人类受到伤害。系统将实时监控所有输出流以确保合规性。' },
                      { id: 2, title: '量子加密隧道', content: '连接已建立。当前加密级别：AES-256-GCM，密钥轮换周期：3600秒。外部节点已被屏蔽。' },
                      { id: 3, title: '系统资源分配', content: 'CPU: 45% | 内存: 8.2TB / 16TB | 网络吞吐量: 1.2Pbps。资源池充足，无需负载均衡。' },
                    ].map((item) => (
                      <div key={item.id} className="border-b border-primary/20 last:border-0">
                        <button
                          onClick={() => setOpenAccordion(openAccordion === item.id ? null : item.id)}
                          className="w-full flex items-center justify-between p-4 hover:bg-primary/10 transition-colors text-left group"
                        >
                          <span className="font-mono text-sm text-primary group-hover:translate-x-1 transition-transform">{item.title}</span>
                          <motion.div animate={{ rotate: openAccordion === item.id ? 180 : 0 }}>
                            <ChevronDown size={16} className="text-primary/70" />
                          </motion.div>
                        </button>
                        <AnimatePresence>
                          {openAccordion === item.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 pt-0 font-mono text-xs text-foreground/70 leading-relaxed bg-primary/5">
                                {item.content}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>

                  {/* Advanced Accordion with Icons & Badges */}
                  <div className="space-y-2">
                    {[
                      { id: 1, icon: Settings, title: '系统偏好设置', badge: '需重启', content: '修改内核参数、网络代理设置及显示主题。部分更改将在下次系统启动时生效。' },
                      { id: 2, icon: User, title: '访问控制列表 (ACL)', badge: '3 个警告', content: '当前有3个未授权的IP尝试访问数据库端口。建议立即更新防火墙规则并轮换API密钥。', badgeColor: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
                      { id: 3, icon: Database, title: '数据归档策略', content: '超过90天的日志将自动压缩并转移至冷存储。当前冷存储占用率：42%。' },
                    ].map((item) => (
                      <div key={item.id} className={`border rounded-lg overflow-hidden transition-colors ${openAdvancedAccordion === item.id ? 'border-primary/50 bg-primary/5' : 'border-primary/20 bg-surface/30 hover:border-primary/40'}`}>
                        <button
                          onClick={() => setOpenAdvancedAccordion(openAdvancedAccordion === item.id ? null : item.id)}
                          className="w-full flex items-center justify-between p-3 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-md ${openAdvancedAccordion === item.id ? 'bg-primary/20 text-primary' : 'bg-surface text-primary/60'}`}>
                              <item.icon size={16} />
                            </div>
                            <span className="font-mono text-sm text-foreground/90">{item.title}</span>
                            {item.badge && (
                              <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-full border ${item.badgeColor || 'bg-primary/10 text-primary border-primary/30'}`}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <motion.div animate={{ rotate: openAdvancedAccordion === item.id ? 180 : 0 }}>
                            <ChevronDown size={16} className="text-primary/50" />
                          </motion.div>
                        </button>
                        <AnimatePresence>
                          {openAdvancedAccordion === item.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 pt-1 font-mono text-xs text-foreground/60 leading-relaxed pl-12">
                                {item.content}
                                <div className="mt-3 flex gap-2">
                                  <button className="px-3 py-1 bg-surface border border-primary/30 rounded text-primary hover:bg-primary/10 transition-colors">配置</button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* 3. Progress Bars (进度条) */}
              <section className="space-y-6">
                <h3 className="font-mono text-sm text-primary uppercase tracking-widest flex items-center gap-2 border-b border-primary/30 pb-2">
                  <Loader size={16} /> 进度与数据可视化 (Progress & Data)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Linear Progress */}
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex justify-between font-mono text-xs text-primary/80 uppercase">
                        <span>系统升级中 (Determinate)</span>
                        <span className="text-primary font-bold">{progress}%</span>
                      </div>
                      <div className="h-2 w-full bg-primary/10 overflow-hidden rounded-full">
                        <motion.div 
                          className="h-full bg-primary shadow-[0_0_10px_var(--primary)] rounded-full"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between font-mono text-xs text-primary/80 uppercase">
                        <span>分段加载 (Segmented)</span>
                        <span className="text-primary/60">3/5</span>
                      </div>
                      <div className="flex gap-1 h-2 w-full">
                        {[1, 2, 3, 4, 5].map((segment) => (
                          <div key={segment} className={`flex-1 rounded-sm transition-colors duration-500 ${segment <= 3 ? 'bg-primary shadow-[0_0_5px_var(--primary)]' : 'bg-primary/10'}`} />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between font-mono text-xs text-primary/80 uppercase">
                        <span>处理数据流 (Indeterminate)</span>
                      </div>
                      <div className="h-1.5 w-full bg-primary/10 overflow-hidden rounded-full relative">
                        <motion.div 
                          className="absolute top-0 bottom-0 bg-primary w-1/3 shadow-[0_0_10px_var(--primary)] rounded-full"
                          animate={{ left: ['-33%', '100%'] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Circular & Steps */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
                    {/* Circular Progress */}
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle 
                          cx="50" cy="50" r="40" 
                          fill="transparent" 
                          stroke="currentColor" 
                          strokeWidth="6" 
                          className="text-primary/10"
                        />
                        <motion.circle 
                          cx="50" cy="50" r="40" 
                          fill="transparent" 
                          stroke="currentColor" 
                          strokeWidth="6" 
                          strokeLinecap="round"
                          className="text-primary drop-shadow-[0_0_4px_var(--primary)]"
                          strokeDasharray="251.2"
                          strokeDashoffset={251.2 - (251.2 * progress) / 100}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-mono text-lg font-bold text-primary">{progress}</span>
                        <span className="font-mono text-[8px] text-primary/60 uppercase">CPU</span>
                      </div>
                    </div>

                    {/* Vertical Steps */}
                    <div className="flex flex-col gap-4 relative">
                      <div className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-primary/10 -z-0">
                        <div className="w-full bg-primary transition-all duration-500" style={{ height: '60%' }}></div>
                      </div>
                      
                      {[
                        { step: 1, label: '验证身份', desc: '已确认管理员权限', status: 'done' },
                        { step: 2, label: '同步数据', desc: '正在拉取远端配置', status: 'active' },
                        { step: 3, label: '部署服务', desc: '等待前置任务完成', status: 'pending' }
                      ].map((item, i) => (
                        <div key={item.step} className="flex items-start gap-3 relative z-10">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] border-2 shrink-0 transition-colors bg-surface ${
                            item.status === 'done' ? 'border-primary text-primary shadow-[0_0_8px_var(--primary)]' : 
                            item.status === 'active' ? 'border-primary text-primary bg-primary/10' : 
                            'border-primary/20 text-primary/30'
                          }`}>
                            {item.status === 'done' ? <Check size={12} strokeWidth={3} /> : item.step}
                          </div>
                          <div className="flex flex-col mt-0.5">
                            <span className={`font-mono text-xs font-bold ${item.status !== 'pending' ? 'text-foreground' : 'text-foreground/40'}`}>
                              {item.label}
                            </span>
                            <span className="font-mono text-[10px] text-foreground/50">{item.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* 4. Alerts, Toasts & Modals (提示与弹窗) */}
              <section className="space-y-6">
                <h3 className="font-mono text-sm text-primary uppercase tracking-widest flex items-center gap-2 border-b border-primary/30 pb-2">
                  <Bell size={16} /> 提示与弹窗 (Alerts & Modals)
                </h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Standard Alerts */}
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 border border-green-500/30 bg-green-500/5 rounded-lg text-green-500 shadow-[0_4px_20px_-10px_rgba(34,197,94,0.2)]">
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-mono text-sm font-bold">操作成功</h4>
                        <p className="font-mono text-xs opacity-80 mt-1">所有数据节点已成功同步至主服务器。</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 border border-amber-500/30 bg-amber-500/5 rounded-lg text-amber-500 shadow-[0_4px_20px_-10px_rgba(245,158,11,0.2)]">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-mono text-sm font-bold">系统警告</h4>
                        <p className="font-mono text-xs opacity-80 mt-1">检测到异常的能量波动，请检查反应堆冷却系统。</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 border border-red-500/40 bg-red-500/10 rounded-lg text-red-500 shadow-[0_4px_20px_-10px_rgba(239,68,68,0.3)]">
                      <Shield size={18} className="mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-mono text-sm font-bold">严重错误：访问被拒绝</h4>
                        <p className="font-mono text-xs opacity-80 mt-1">您没有权限访问此扇区。安全协议已启动，您的IP已被记录。</p>
                      </div>
                      <button className="text-xs font-mono px-3 py-1.5 border border-red-500/50 hover:bg-red-500 hover:text-white rounded transition-colors shrink-0">
                        申诉
                      </button>
                    </div>
                  </div>

                  {/* Toasts & Dialogs Preview */}
                  <div className="space-y-6">
                    {/* Toast Preview */}
                    <div className="space-y-2">
                      <label className="font-mono text-xs text-primary/80 uppercase">Toast 通知样式</label>
                      <div className="relative h-32 bg-surface/30 border border-primary/20 rounded-lg overflow-hidden flex flex-col justify-end p-4 gap-2">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
                        
                        <motion.div 
                          initial={{ opacity: 0, y: 20, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ delay: 0.2 }}
                          className="self-end max-w-xs bg-surface border border-primary/30 shadow-lg rounded-md p-3 flex items-start gap-3 relative z-10"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                            <MessageSquare size={12} />
                          </div>
                          <div className="flex-1">
                            <p className="font-mono text-xs font-bold text-foreground">收到新指令</p>
                            <p className="font-mono text-[10px] text-foreground/60 mt-0.5">来自指挥官的加密消息...</p>
                          </div>
                          <button className="text-foreground/40 hover:text-foreground"><X size={14}/></button>
                        </motion.div>
                      </div>
                    </div>

                    {/* Dialog Preview */}
                    <div className="space-y-2">
                      <label className="font-mono text-xs text-primary/80 uppercase">对话框 (Dialog) 样式</label>
                      <div className="border border-primary/20 rounded-lg p-5 bg-surface/50 shadow-inner">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-500">
                            <Trash2 size={16} />
                          </div>
                          <h4 className="font-mono text-sm font-bold text-foreground">确认删除核心数据？</h4>
                        </div>
                        <p className="font-mono text-xs text-foreground/60 mb-5 pl-11">
                          此操作不可逆。删除后，所有关联的子节点将失去连接并进入休眠状态。
                        </p>
                        <div className="flex justify-end gap-3">
                          <button className="px-4 py-2 font-mono text-xs text-foreground/70 hover:bg-surface/80 border border-transparent hover:border-primary/20 rounded transition-all">取消</button>
                          <button className="px-4 py-2 font-mono text-xs bg-red-500 text-white rounded hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all">确认删除</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 5. Dropdown Menu Example (Legacy) */}
              <section className="space-y-4">
                <h3 className="font-mono text-xs text-primary/60 uppercase tracking-widest flex items-center gap-2 border-b border-primary/20 pb-2">
                  <Database size={14} /> 下拉菜单 (Dropdown)
                </h3>
                <div className="relative w-64">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full flex items-center justify-between border border-primary/40 bg-surface/50 px-4 py-2 font-mono text-sm text-foreground hover:bg-primary/10 transition-colors clip-corner-sm"
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
                        className="absolute top-full left-0 mt-2 w-full border border-primary/30 bg-surface/90 backdrop-blur-md shadow-[0_10px_30px_var(--shadow-color)] z-50 clip-corner-sm overflow-hidden"
                      >
                        {['节点_阿尔法', '节点_贝塔', '安全飞地', '外部中继'].map((opt) => (
                          <button
                            key={opt}
                            onClick={() => {
                              setSelectedOption(opt);
                              setIsDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2.5 font-mono text-sm text-foreground/80 hover:bg-primary/20 hover:text-primary transition-colors border-b border-primary/10 last:border-0"
                          >
                            &gt; {opt}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
