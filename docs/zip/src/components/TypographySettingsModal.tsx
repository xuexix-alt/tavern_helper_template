import { motion, AnimatePresence } from 'motion/react';
import { Type, X, Check } from 'lucide-react';
import { useTypography, FontFamily, FontSize, LineHeight } from '../contexts/TypographyContext';

interface TypographySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TypographySettingsModal({ isOpen, onClose }: TypographySettingsModalProps) {
  const { typography, setTypography } = useTypography();

  const fonts: { id: FontFamily; label: string; class: string }[] = [
    { id: 'sans', label: '无衬线 (现代)', class: 'font-sans' },
    { id: 'serif', label: '衬线 (经典)', class: 'font-serif' },
    { id: 'mono', label: '等宽 (终端)', class: 'font-mono' },
  ];

  const sizes: { id: FontSize; label: string }[] = [
    { id: 'sm', label: '小' },
    { id: 'base', label: '中' },
    { id: 'lg', label: '大' },
    { id: 'xl', label: '特大' },
  ];

  const lineHeights: { id: LineHeight; label: string }[] = [
    { id: 'tight', label: '紧凑' },
    { id: 'normal', label: '标准' },
    { id: 'relaxed', label: '宽松' },
    { id: 'loose', label: '极宽' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-[110] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border border-primary/30 bg-surface/95 p-6 shadow-2xl clip-corner backdrop-blur-xl"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between border-b border-primary/20 pb-4">
              <div className="flex items-center gap-3 text-primary">
                <Type size={20} />
                <h2 className="font-mono text-lg font-bold tracking-widest">排版设置</h2>
              </div>
              <button
                onClick={onClose}
                className="text-primary/50 hover:text-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-6">
              {/* Font Family */}
              <div className="flex flex-col gap-3">
                <label className="font-mono text-xs font-bold tracking-widest text-primary/70">字体风格</label>
                <div className="grid grid-cols-3 gap-2">
                  {fonts.map((font) => (
                    <button
                      key={font.id}
                      onClick={() => setTypography({ fontFamily: font.id })}
                      className={`flex flex-col items-center justify-center gap-2 border p-3 transition-all clip-corner-sm ${
                        typography.fontFamily === font.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-primary/20 bg-surface/50 text-primary/60 hover:border-primary/50 hover:bg-primary/5'
                      }`}
                    >
                      <span className={`text-lg ${font.class}`}>Aa</span>
                      <span className="text-xs">{font.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="flex flex-col gap-3">
                <label className="font-mono text-xs font-bold tracking-widest text-primary/70">字号大小</label>
                <div className="flex gap-2">
                  {sizes.map((size) => (
                    <button
                      key={size.id}
                      onClick={() => setTypography({ fontSize: size.id })}
                      className={`flex-1 border py-2 text-sm transition-all clip-corner-sm ${
                        typography.fontSize === size.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-primary/20 bg-surface/50 text-primary/60 hover:border-primary/50 hover:bg-primary/5'
                      }`}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Height */}
              <div className="flex flex-col gap-3">
                <label className="font-mono text-xs font-bold tracking-widest text-primary/70">行距</label>
                <div className="flex gap-2">
                  {lineHeights.map((lh) => (
                    <button
                      key={lh.id}
                      onClick={() => setTypography({ lineHeight: lh.id })}
                      className={`flex-1 border py-2 text-sm transition-all clip-corner-sm ${
                        typography.lineHeight === lh.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-primary/20 bg-surface/50 text-primary/60 hover:border-primary/50 hover:bg-primary/5'
                      }`}
                    >
                      {lh.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="mt-4 border border-primary/20 bg-background/50 p-4 relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/30"></div>
                <p
                  className={`text-primary/90 transition-all duration-300 ${
                    { sans: 'font-sans', serif: 'font-serif', mono: 'font-mono' }[typography.fontFamily]
                  } ${
                    { sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl' }[typography.fontSize]
                  } ${
                    { tight: 'leading-tight', normal: 'leading-normal', relaxed: 'leading-relaxed', loose: 'leading-loose' }[typography.lineHeight]
                  }`}
                >
                  “霓虹灯在湿润的沥青路面上闪烁，数据流穿过城市的每一个神经元。在这个赛博空间里，排版决定了信息的呼吸节奏。”
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
