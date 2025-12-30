import { Progress } from "./ui/progress";
import { TrendingUp, DollarSign } from "lucide-react";

export function ProfitsSection() {
  const profitPercentage = 68;

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-black/60 backdrop-blur-xl border border-violet-500/20 rounded-3xl p-6 shadow-2xl shadow-violet-500/10">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white">Total Profits</h3>
        <TrendingUp className="w-5 h-5 text-green-400" />
      </div>

      <div className="relative mb-6">
        <div className="w-32 h-32 mx-auto relative">
          {/* Circular Progress */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="rgba(100, 116, 139, 0.2)"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="url(#gradient)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${profitPercentage * 2.83} 283`}
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl text-white mb-1">68%</div>
            <div className="text-xs text-slate-400">Win Rate</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-slate-400 text-sm">Balance</span>
            </div>
            <span className="text-white">$12,450.89</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-green-500/10 to-emerald-600/10 border border-green-500/20 rounded-xl p-3 text-center">
            <div className="text-green-400 text-lg">+$2,340</div>
            <div className="text-green-400/70 text-xs">This Week</div>
          </div>
          <div className="bg-gradient-to-br from-orange-500/10 to-red-600/10 border border-orange-500/20 rounded-xl p-3 text-center">
            <div className="text-orange-400 text-lg">-$158</div>
            <div className="text-orange-400/70 text-xs">Today</div>
          </div>
        </div>
      </div>
    </div>
  );
}