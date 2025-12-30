import { ImageWithFallback } from "./figma/ImageWithFallback";
import { Crown, Medal, Award } from "lucide-react";

const topPlayers = [
  { 
    rank: 1, 
    name: "ShadowMaster", 
    points: "15,420",
    avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    change: "+250"
  },
  { 
    rank: 2, 
    name: "NeonStorm", 
    points: "14,890",
    avatar: "https://images.unsplash.com/photo-1620110500184-d24e04981faf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBuZW9uJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzU5Nzc3OTkzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    change: "+180"
  },
  { 
    rank: 3, 
    name: "VoidWalker", 
    points: "14,560",
    avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    change: "+120"
  },
  { 
    rank: 4, 
    name: "CyberPhantom", 
    points: "13,980",
    avatar: "https://images.unsplash.com/photo-1620110500184-d24e04981faf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBuZW9uJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzU5Nzc3OTkzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    change: "+95"
  },
  { 
    rank: 5, 
    name: "QuantumBlade", 
    points: "13,750",
    avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    change: "+80"
  }
];

export function TopPlayers() {
  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-4 h-4 text-yellow-400" />;
      case 2:
        return <Medal className="w-4 h-4 text-gray-400" />;
      case 3:
        return <Award className="w-4 h-4 text-orange-600" />;
      default:
        return <span className="text-slate-400 text-sm w-4 text-center">{rank}</span>;
    }
  };

  const getRankBorder = (rank: number) => {
    switch (rank) {
      case 1:
        return "border-yellow-400/50";
      case 2:
        return "border-gray-400/50";
      case 3:
        return "border-orange-600/50";
      default:
        return "border-slate-600/50";
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-black/60 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-4 shadow-2xl shadow-purple-500/10">
      <div className="flex items-center space-x-2 mb-4">
        <Crown className="w-5 h-5 text-purple-400" />
        <h3 className="text-white">Top Players</h3>
      </div>

      <div className="space-y-3">
        {topPlayers.map((player) => (
          <div
            key={player.rank}
            className={`flex items-center space-x-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-all duration-300 border ${
              player.rank <= 3 ? getRankBorder(player.rank) : 'border-transparent hover:border-purple-500/20'
            } ${player.rank === 1 ? 'bg-gradient-to-r from-yellow-500/5 to-orange-500/5' : ''}`}
          >
            <div className="flex items-center justify-center w-6">
              {getRankIcon(player.rank)}
            </div>

            <div className={`relative w-10 h-10 rounded-lg overflow-hidden border ${getRankBorder(player.rank)}`}>
              <ImageWithFallback
                src={player.avatar}
                alt={player.name}
                className="w-full h-full object-cover"
              />
              {player.rank === 1 && (
                <div className="absolute inset-0 bg-gradient-to-t from-yellow-400/20 to-transparent"></div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-sm truncate ${
                  player.rank === 1 ? 'text-yellow-400' : 
                  player.rank === 2 ? 'text-gray-300' : 
                  player.rank === 3 ? 'text-orange-400' : 'text-white'
                }`}>
                  {player.name}
                </span>
                <span className="text-purple-400 text-sm">{player.points}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">Points</span>
                <span className="text-green-400 text-xs">+{player.change}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full mt-4 py-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl text-purple-400 text-sm hover:from-purple-500/20 hover:to-pink-500/20 transition-all duration-300">
        View Full Leaderboard
      </button>
    </div>
  );
}