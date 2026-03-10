import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radar, User } from 'lucide-react';
import { CHARACTERS } from '../data/characters';

interface RadialMenuProps {
  activeCharId: string;
  onSelectChar: (id: string) => void;
  onOpenSidebar: () => void;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
}

function describeArc(x: number, y: number, innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(x, y, outerRadius, endAngle);
  const endOuter = polarToCartesian(x, y, outerRadius, startAngle);
  const startInner = polarToCartesian(x, y, innerRadius, endAngle);
  const endInner = polarToCartesian(x, y, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", startOuter.x, startOuter.y,
    "A", outerRadius, outerRadius, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerRadius, innerRadius, 0, largeArcFlag, 1, startInner.x, startInner.y,
    "Z"
  ].join(" ");
}

export function RadialMenu({ activeCharId, onSelectChar, onOpenSidebar }: RadialMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [menuCenter, setMenuCenter] = useState({ x: 0, y: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const lastOpenTime = useRef<number>(0);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const startTime = useRef<number>(0);
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const MOVE_THRESHOLD = 10;

  if (CHARACTERS.length === 0) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    startPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
    setIsPressing(true);
    startTime.current = Date.now();
    
    if (pressTimer.current) clearTimeout(pressTimer.current);

    pressTimer.current = setTimeout(() => {
      if (!isDragging.current) {
        setMenuCenter({ x: cx, y: cy });
        setIsOpen(true);
        setIsSticky(false);
        lastOpenTime.current = Date.now();
        
        // Haptic feedback simulation
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
          try { window.navigator.vibrate(10); } catch (e) {}
        }
      }
    }, 350); // Increased for better stability between tap and long press
  };

  const handlePointerMoveButton = (e: React.PointerEvent) => {
    if (pressTimer.current && !isDragging.current) {
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If moved beyond threshold, it's likely a drag or swipe, not a long press
      if (distance > MOVE_THRESHOLD) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    }
  };

  const handleTap = (cx: number, cy: number) => {
    if (isDragging.current) return;

    if (!isOpen) {
      setMenuCenter({ x: cx, y: cy });
      setIsOpen(true);
      setIsSticky(true);
      lastOpenTime.current = Date.now();
    } else if (isSticky) {
      setIsOpen(false);
      setIsSticky(false);
    }
  };

  const handlePointerUpButton = (e: React.PointerEvent) => {
    setIsPressing(false);
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handlePointerUpGlobal = (e: PointerEvent) => {
    if (!isOpen) return;

    // If it was a long press (not sticky), select and close on release
    if (!isSticky) {
      if (hoveredIndex !== null && CHARACTERS[hoveredIndex]) {
        onSelectChar(CHARACTERS[hoveredIndex].id);
        onOpenSidebar();
      }
      setIsOpen(false);
      setHoveredIndex(null);
    } else {
      // Sticky mode: check if we clicked on a slice or outside
      // Guard against the initial release that opened the menu
      if (Date.now() - lastOpenTime.current < 300) return;

      if (hoveredIndex !== null && CHARACTERS[hoveredIndex]) {
        onSelectChar(CHARACTERS[hoveredIndex].id);
        onOpenSidebar();
        setIsOpen(false);
        setIsSticky(false);
        setHoveredIndex(null);
      } else {
        // Check if clicked outside the menu area
        const dx = e.clientX - menuCenter.x;
        const dy = e.clientY - menuCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 200 || distance < 30) {
          setIsOpen(false);
          setIsSticky(false);
          setHoveredIndex(null);
        }
      }
    }
  };

  const handlePointerMoveGlobal = (e: PointerEvent) => {
    if (!isOpen) return;
    const dx = e.clientX - menuCenter.x;
    const dy = e.clientY - menuCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 50 || distance > 220) {
      setHoveredIndex(null); // Deadzone in the middle or too far away
      return;
    }

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = angle + 90;
    if (angle < 0) angle += 360;

    const sliceAngle = 360 / CHARACTERS.length;
    let shiftedAngle = (angle + sliceAngle / 2) % 360;
    let index = Math.floor(shiftedAngle / sliceAngle);
    
    // Safety check
    if (index >= 0 && index < CHARACTERS.length) {
      setHoveredIndex(index);
    } else {
      setHoveredIndex(null);
    }
  };

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUpGlobal);
    window.addEventListener('pointermove', handlePointerMoveGlobal);
    return () => {
      window.removeEventListener('pointerup', handlePointerUpGlobal);
      window.removeEventListener('pointermove', handlePointerMoveGlobal);
    };
  }, [isOpen, menuCenter, hoveredIndex]);

  const sliceAngle = 360 / CHARACTERS.length;
  // Dynamically calculate gap so it doesn't break if there are many characters
  const actualGap = Math.min(4, sliceAngle * 0.15); 
  
  // Responsive text sizing based on number of slices
  const showRole = CHARACTERS.length <= 6;
  const nameFontSize = CHARACTERS.length > 8 ? 'text-[8px]' : 'text-[11px]';

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.button
        drag={!isOpen}
        dragMomentum={false}
        onDragStart={() => {
          isDragging.current = true;
          if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
          }
        }}
        onDragEnd={() => {
          setTimeout(() => {
            isDragging.current = false;
          }, 50);
        }}
        onTap={(e) => {
          // @ts-ignore - framer-motion event types
          const rect = e.target?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          handleTap(cx, cy);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMoveButton}
        onPointerUp={handlePointerUpButton}
        className={`fixed right-4 bottom-48 md:right-8 md:bottom-32 z-[110] flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-background/40 text-primary shadow-[0_4px_20px_var(--shadow-color)] backdrop-blur-2xl transition-all hover:bg-primary/20 hover:shadow-[0_0_25px_rgba(var(--primary-rgb),0.6)] cursor-grab active:cursor-grabbing ${isPressing && !isOpen ? 'scale-90 bg-primary/20 border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)]' : ''}`}
        title="长按滑动选取，单击展开选取，拖拽移动"
      >
        <Radar size={24} className="animate-[spin_4s_linear_infinite]" />
        <div className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-background">
          {CHARACTERS.length}
        </div>
      </motion.button>

      {/* Radial Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/40 backdrop-blur-md"
          >
            <div 
              className="absolute"
              style={{ 
                left: menuCenter.x - 150, 
                top: menuCenter.y - 150,
                width: 300,
                height: 300
              }}
            >
              <svg width="300" height="300" viewBox="0 0 300 300" className="drop-shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]">
                {CHARACTERS.map((char, i) => {
                  const startAngle = i * sliceAngle - sliceAngle / 2 + actualGap / 2;
                  const endAngle = (i + 1) * sliceAngle - sliceAngle / 2 - actualGap / 2;
                  const midAngle = startAngle + (endAngle - startAngle) / 2;
                  
                  const isHovered = hoveredIndex === i;
                  const isActive = activeCharId === char.id;
                  
                  const pathData = describeArc(150, 150, 50, 140, startAngle, endAngle);
                  
                  // Text position
                  const textRadius = 95;
                  const textX = 150 + Math.cos((midAngle - 90) * Math.PI / 180) * textRadius;
                  const textY = 150 + Math.sin((midAngle - 90) * Math.PI / 180) * textRadius;

                  return (
                    <g key={char.id} className="transition-all duration-200">
                      <path
                        d={pathData}
                        className={`transition-colors duration-200 stroke-2 ${
                          isHovered 
                            ? 'fill-primary stroke-primary' 
                            : isActive 
                              ? 'fill-primary/30 stroke-primary/50' 
                              : 'fill-surface/90 stroke-primary/50'
                        }`}
                      />
                      <text
                        x={textX}
                        y={showRole ? textY - 8 : textY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className={`font-mono ${nameFontSize} font-bold tracking-widest pointer-events-none ${
                          isHovered ? 'fill-background' : 'fill-primary'
                        }`}
                      >
                        {char.name.split(' ')[0].replace(/["']/g, '')}
                      </text>
                      {showRole && (
                        <text
                          x={textX}
                          y={textY + 8}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className={`font-mono text-[9px] pointer-events-none ${
                            isHovered ? 'fill-background/70' : 'fill-primary/50'
                          }`}
                        >
                          {char.role}
                        </text>
                      )}
                    </g>
                  );
                })}
                
                {/* Center Hub */}
                <circle cx="150" cy="150" r="40" className="fill-surface/90 stroke-primary/50 stroke-2" />
                <circle cx="150" cy="150" r="30" className="fill-transparent stroke-primary/20 stroke-1 animate-[spin_10s_linear_infinite]" strokeDasharray="4 4" />
              </svg>
              
              {/* Center Icon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <User size={24} className="text-primary" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
