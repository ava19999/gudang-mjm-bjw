// FILE: src/components/common/NotificationBadge.tsx
import React from 'react';

interface NotificationBadgeProps {
  count: number;
  color?: 'red' | 'orange';
  animate?: boolean;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({ 
  count, 
  color = 'red',
  animate = false 
}) => {
  if (count === 0) return null;
  
  const colorClasses = {
    red: 'bg-red-500',
    orange: 'bg-orange-500'
  };
  
  return (
    <span 
      className={`
        absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 
        ${colorClasses[color]} text-white text-[9px] font-bold 
        rounded-full border-2 border-gray-800 
        flex items-center justify-center shadow-lg
        ${animate ? 'animate-pulse' : ''}
      `}
    >
      {count}
    </span>
  );
};
