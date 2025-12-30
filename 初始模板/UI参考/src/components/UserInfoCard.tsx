import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Progress } from "./ui/progress";
import { Coins, Zap, Trophy } from "lucide-react";

export function UserInfoCard() {
  const xpProgress = 75;

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-black/60 backdrop-blur-xl border border-orange-500/20 rounded-3xl p-6 shadow-2xl shadow-orange-500/10">
      <div className="flex items-center space-x-4 mb-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-400/30 shadow-lg shadow-orange-500/20">
            <ImageWithFallback
              src="https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
              alt="User Avatar"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-400 rounded-full border-2 border-black flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          </div>
        </div>

        <div className="flex-1">
          <h4 className="text-white">ProGamer_X</h4>
          <div className="text-orange-400 text-sm">Level 47</div>
        </div>
      </div>

      <div className="space-y-4">
        {/* XP Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400 flex items-center space-x-1">
              <Zap className="w-4 h-4" />
              <span>XP Progress</span>
            </span>
            <span className="text-orange-400">7,500 / 10,000</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div 
              className="h-2 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full transition-all duration-1000"
              style={{ width: `${xpProgress}%` }}
            ></div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="flex items-center space-x-2 mb-1">
              <Coins className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm">Coins</span>
            </div>
            <div className="text-white">2,850</div>
          </div>
          
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="flex items-center space-x-2 mb-1">
              <Trophy className="w-4 h-4 text-purple-400" />
              <span className="text-purple-400 text-sm">Rank</span>
            </div>
            <div className="text-white">#127</div>
          </div>
        </div>

        {/* Achievement Badge */}
        <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-white text-sm">Elite Player</div>
              <div className="text-purple-400 text-xs">Unlocked today</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}