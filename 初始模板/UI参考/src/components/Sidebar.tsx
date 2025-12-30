import { Search, TrendingUp, Plus, BarChart3, User, Heart } from "lucide-react";

const menuItems = [
  { icon: Search, label: "Search", active: false },
  { icon: TrendingUp, label: "Hot", active: true },
  { icon: Plus, label: "New", active: false },
  { icon: BarChart3, label: "Rising", active: false },
  { icon: User, label: "Profile", active: false },
  { icon: Heart, label: "Favorite", active: false },
];

export function Sidebar() {
  return (
    <div className="w-20 h-full bg-gradient-to-b from-slate-900/80 to-black/80 backdrop-blur-xl border-r border-blue-500/20 flex flex-col items-center py-6 space-y-6">
      {/* Logo */}
      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
        <div className="w-6 h-6 bg-white rounded-sm"></div>
      </div>

      {/* Menu Items */}
      <div className="flex flex-col space-y-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative group ${
                item.active
                  ? "bg-gradient-to-br from-blue-500/20 to-violet-600/20 border border-blue-400/30 shadow-lg shadow-blue-500/20"
                  : "bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-blue-500/30"
              }`}
            >
              <Icon
                className={`w-6 h-6 transition-colors duration-300 ${
                  item.active ? "text-blue-400" : "text-slate-400 group-hover:text-blue-400"
                }`}
              />
              {item.active && (
                <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-blue-400 to-violet-500 rounded-full"></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}