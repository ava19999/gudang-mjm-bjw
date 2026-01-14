// FILE: src/components/dashboard/StatCard.tsx
import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color: 'blue' | 'purple' | 'green' | 'red' | 'yellow';
  interactive?: boolean;
  onClick?: () => void;
  detailText?: string;
  backgroundImage?: boolean;
}

const colorConfig = {
  blue: {
    gradient: 'from-blue-900/50 via-blue-800/30 to-gray-800',
    border: 'border-blue-800/60',
    shadow: 'shadow-blue-900/20 hover:shadow-blue-800/30',
    iconBg: 'bg-blue-900/60',
    textColor: 'text-blue-400',
    hoverBorder: '',
  },
  purple: {
    gradient: 'from-purple-900/50 via-purple-800/30 to-gray-800',
    border: 'border-purple-800/60',
    shadow: 'shadow-purple-900/20 hover:shadow-purple-800/30',
    iconBg: 'bg-purple-900/60',
    textColor: 'text-purple-400',
    hoverBorder: '',
  },
  green: {
    gradient: 'from-green-900/30 to-gray-800',
    border: 'border-green-800/50',
    shadow: 'shadow-green-900/20',
    iconBg: 'bg-green-900/40',
    textColor: 'text-green-400',
    hoverBorder: 'hover:border-green-700/70',
  },
  red: {
    gradient: 'from-red-900/30 to-gray-800',
    border: 'border-red-800/50',
    shadow: 'shadow-red-900/20',
    iconBg: 'bg-red-900/40',
    textColor: 'text-red-400',
    hoverBorder: 'hover:border-red-700/70',
  },
  yellow: {
    gradient: 'from-yellow-900/20 via-gray-900 to-gray-800',
    border: 'border-yellow-800/40',
    shadow: '',
    iconBg: 'bg-yellow-900/30',
    textColor: 'text-yellow-400',
    hoverBorder: 'hover:border-yellow-700/50',
  },
};

export const StatCard: React.FC<StatCardProps> = ({ 
  icon: Icon, 
  label, 
  value, 
  color,
  interactive = false,
  onClick,
  detailText,
  backgroundImage = false,
}) => {
  const config = colorConfig[color];
  const Tag = interactive ? 'button' : 'div';
  
  const transitionDuration = interactive ? 'transition-all duration-200' : 'transition-all duration-300';
  
  const baseClasses = `
    min-w-[145px] snap-start snap-always 
    bg-gradient-to-br ${config.gradient}
    p-3.5 rounded-2xl border ${config.border}
    flex flex-col justify-between h-[110px] 
    md:w-auto shadow-lg ${config.shadow}
    ${transitionDuration}
    relative overflow-hidden
  `;
  
  const interactiveClasses = interactive 
    ? `text-left ${config.hoverBorder} hover:shadow-lg active:scale-[0.97] shadow-md cursor-pointer`
    : '';

  return (
    <Tag 
      className={`${baseClasses} ${interactiveClasses}`}
      onClick={interactive ? onClick : undefined}
    >
      {backgroundImage && (
        <div className="absolute right-1 top-1 opacity-[0.08]">
          <Icon size={52} className={config.textColor} />
        </div>
      )}
      
      <div className={`flex items-center ${interactive ? 'justify-between w-full' : 'gap-2'} ${config.textColor} mb-1.5 relative z-10`}>
        <div className={`flex items-center gap-2`}>
          <div className={`${backgroundImage ? 'p-1.5 rounded-lg' : 'p-2 rounded-xl'} ${config.iconBg} shadow-inner`}>
            <Icon size={backgroundImage ? 15 : 16} className="drop-shadow-sm" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        </div>
      </div>
      
      <div className="relative z-10">
        <div className={`${interactive ? 'text-xl' : 'text-2xl'} font-extrabold ${backgroundImage ? 'text-yellow-50' : 'text-white'} drop-shadow-md ${detailText ? 'mb-1' : ''}`}>
          {value}
        </div>
        {detailText && (
          <div className={`text-[10px] ${config.textColor} font-semibold flex items-center gap-0.5 hover:gap-1 transition-all`}>
            {detailText} <ChevronRight size={12} className="drop-shadow-sm" />
          </div>
        )}
      </div>
    </Tag>
  );
};
