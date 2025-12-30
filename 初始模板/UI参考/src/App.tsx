import { Sidebar } from "./components/Sidebar";
import { FeaturedGameCard } from "./components/FeaturedGameCard";
import { ProfitsSection } from "./components/ProfitsSection";
import { UserInfoCard } from "./components/UserInfoCard";
import { LastWinners } from "./components/LastWinners";
import { TournamentChat } from "./components/TournamentChat";
import { TopPlayers } from "./components/TopPlayers";

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-600/5 via-purple-600/5 to-orange-600/5"></div>
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl"></div>
      
      <div className="relative z-10 flex h-screen">
        {/* Sidebar */}
        <Sidebar />
        
        {/* Main Content */}
        <div className="flex-1 flex gap-6 p-6 overflow-hidden">
          {/* Center Column */}
          <div className="flex-1 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-4xl bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent mb-2">
                    GameLand
                  </h1>
                  <p className="text-slate-400">Professional eSports Control Panel</p>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-slate-400 text-sm">Total Online</div>
                    <div className="text-white">24,567 players</div>
                  </div>
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>

            {/* Featured Game */}
            <FeaturedGameCard />
            
            {/* Stats Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProfitsSection />
              <UserInfoCard />
            </div>
          </div>
          
          {/* Right Sidebar */}
          <div className="w-80 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <LastWinners />
            <TournamentChat />
            <TopPlayers />
          </div>
        </div>
      </div>
    </div>
  );
}