import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface Coin {
  name: string;
  symbol: string;
  color: string;
}

interface Props {
  coins: Coin[];
  activeCoin: string;
  onChange: (symbol: string) => void;
}

export const SearchableCoinDropdown: React.FC<Props> = ({ coins, activeCoin, onChange }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredCoins = coins.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const activeCoinObj = coins.find(c => c.symbol === activeCoin) || { name: 'INR', symbol: 'INR', color: '#FFD700' };

  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black/60 border border-zinc-800 text-zinc-300 font-bold font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded cursor-pointer hover:border-zinc-700 outline-none flex items-center justify-between gap-2 min-w-[80px]"
      >
        <span style={{ color: activeCoinObj.color }}>{activeCoinObj.symbol}</span>
        <span>▼</span>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-[#1A1A1A] border border-zinc-800 rounded-lg shadow-xl z-[100] p-2">
          <div className="flex items-center gap-2 bg-black px-2 py-1 rounded border border-zinc-800 mb-2">
            <Search className="w-3 h-3 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-white text-[10px] w-full outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            <div 
              onClick={() => { onChange('INR'); setIsOpen(false); }}
              className="px-2 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-zinc-800 rounded text-yellow-500"
            >
              ₹ INR
            </div>
            {filteredCoins.map(coin => (
              <div 
                key={coin.symbol}
                onClick={() => { onChange(coin.symbol); setIsOpen(false); }}
                className="px-2 py-1.5 text-[10px] font-bold cursor-pointer hover:bg-zinc-800 rounded text-white"
                style={{ color: coin.color }}
              >
                {coin.symbol}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
