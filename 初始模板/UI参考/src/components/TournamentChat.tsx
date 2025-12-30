import { ImageWithFallback } from "./figma/ImageWithFallback";
import { MessageCircle, Send } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

const chatMessages = [
  { 
    user: "ProSniper", 
    message: "GG everyone! That was intense 🔥", 
    time: "1m",
    avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    isWinner: true
  },
  { 
    user: "TechNinja", 
    message: "Anyone up for duo queue?", 
    time: "2m",
    avatar: "https://images.unsplash.com/photo-1620110500184-d24e04981faf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBuZW9uJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzU5Nzc3OTkzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    isWinner: false
  },
  { 
    user: "EliteGamer", 
    message: "Next tournament in 30 mins!", 
    time: "3m",
    avatar: "https://images.unsplash.com/photo-1699524826369-57870e627c43?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYW1pbmclMjBhdmF0YXIlMjBwcm9maWxlfGVufDF8fHx8MTc1OTc0MTY4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    isWinner: false
  },
  { 
    user: "CyberAce", 
    message: "Great plays in the final round!", 
    time: "4m",
    avatar: "https://images.unsplash.com/photo-1620110500184-d24e04981faf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjeWJlcnB1bmslMjBuZW9uJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzU5Nzc3OTkzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    isWinner: false
  }
];

export function TournamentChat() {
  return (
    <div className="bg-gradient-to-br from-slate-900/80 to-black/60 backdrop-blur-xl border border-blue-500/20 rounded-2xl p-4 shadow-2xl shadow-blue-500/10 h-80 flex flex-col">
      <div className="flex items-center space-x-2 mb-4">
        <MessageCircle className="w-5 h-5 text-blue-400" />
        <h3 className="text-white">Tournament Chat</h3>
        <div className="ml-auto flex items-center space-x-1">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-green-400 text-xs">124 online</span>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {chatMessages.map((msg, index) => (
          <div key={index} className="flex items-start space-x-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-600/50">
                <ImageWithFallback
                  src={msg.avatar}
                  alt={msg.user}
                  className="w-full h-full object-cover"
                />
              </div>
              {msg.isWinner && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full"></div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className={`text-sm ${msg.isWinner ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {msg.user}
                </span>
                <span className="text-slate-500 text-xs">{msg.time}</span>
              </div>
              <p className="text-slate-300 text-sm break-words">{msg.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-slate-700/50">
        <Input
          placeholder="Type a message..."
          className="flex-1 bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-400 focus:border-blue-500/50 rounded-xl"
        />
        <Button size="icon" className="bg-gradient-to-r from-blue-500 to-violet-600 hover:from-blue-600 hover:to-violet-700 border border-blue-400/30 shadow-lg shadow-blue-500/25 rounded-xl">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}