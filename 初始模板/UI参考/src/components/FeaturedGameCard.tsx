import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Button } from "./ui/button";
import { Play, Star } from "lucide-react";

export function FeaturedGameCard() {
  return (
    <div className="relative bg-gradient-to-br from-slate-900/80 to-black/60 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-6 shadow-2xl shadow-blue-500/10 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-violet-600/5 rounded-3xl"></div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-orange-500/20 to-transparent rounded-full blur-3xl"></div>
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-green-400 text-sm">Live</span>
          </div>
          <div className="flex items-center space-x-1">
            <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
            <span className="text-orange-400 text-sm">4.9</span>
          </div>
        </div>

        <div className="aspect-[16/9] rounded-2xl overflow-hidden mb-4 relative group">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1653290048341-ad1a683279ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvdmVyd2F0Y2glMjBnYW1lJTIwY292ZXIlMjBhcnR8ZW58MXx8fHwxNzU5ODI0Njg1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Overwatch"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
          <button className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="text-white text-xl font-bold">Overwatch 2</h3>
          <p className="text-slate-400 text-sm">Team-based multiplayer first-person shooter</p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <div className="text-sm text-slate-400">Prize Pool</div>
                <div className="text-orange-400">$2.5M</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-slate-400">Players</div>
                <div className="text-blue-400">1,254</div>
              </div>
            </div>
            
            <Button className="bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 border border-blue-400/30 shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-blue-500/40 hover:shadow-xl px-6 rounded-xl">
              Deposit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}