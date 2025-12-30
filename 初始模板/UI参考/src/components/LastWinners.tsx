import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Trophy, DollarSign } from "lucide-react";

const winners = [
  { name: "CyberNinja", amount: "$1,250", game: "Overwatch", avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral", time: "2m ago" },
  { name: "QuantumGamer", amount: "$890", game: "Valorant", avatar: "https://images.unsplash.com/photo-1620110500184-d24e04981faf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBuZW9uJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzU5Nzc3OTkzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral", time: "5m ago" },
  { name: "NeonStrike", amount: "$650", game: "Apex Legends", avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral", time: "8m ago" },
  { name: "VoidHunter", amount: "$420", game: "CS:GO", avatar: "https://images.unsplash.com/photo-1620110500184-d24e04981faf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBuZW9uJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzU5Nzc3OTkzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral", time: "12m ago" }
];

export function LastWinners() {
  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-black/60 backdrop-blur-xl border border-green-500/20 rounded-2xl p-4 shadow-2xl shadow-green-500/10">
      <div className="flex items-center space-x-2 mb-4">
        <Trophy className="w-5 h-5 text-green-400" />
        <h3 className="text-white">Last Winners</h3>
      </div>

      <div className="space-y-3">
        {winners.map((winner, index) => (
          <div
            key={index}
            className="flex items-center space-x-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-all duration-300 border border-transparent hover:border-green-500/20"
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-lg overflow-hidden border border-green-400/20">
                <ImageWithFallback
                  src={winner.avatar}
                  alt={winner.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {index === 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                  <Trophy className="w-2 h-2 text-black" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-white text-sm truncate">{winner.name}</span>
                <span className="text-green-400 text-sm flex items-center space-x-1">
                  <DollarSign className="w-3 h-3" />
                  <span>{winner.amount}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">{winner.game}</span>
                <span className="text-slate-500 text-xs">{winner.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full mt-4 py-2 bg-gradient-to-r from-green-500/10 to-emerald-600/10 border border-green-500/20 rounded-xl text-green-400 text-sm hover:from-green-500/20 hover:to-emerald-600/20 transition-all duration-300">
        View All Winners
      </button>
    </div>
  );
}