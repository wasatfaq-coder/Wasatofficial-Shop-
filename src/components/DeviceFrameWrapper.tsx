import React from 'react';

interface DeviceFrameWrapperProps {
  children: React.ReactNode;
}

export const DeviceFrameWrapper: React.FC<DeviceFrameWrapperProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-[#E3E8EF] flex justify-center items-start text-[#2D3A4E] antialiased selection:bg-[#5F6ED0] selection:text-white">
      {/* Main Cohesive App Shell Container */}
      <div className="w-full max-w-md md:max-w-lg min-h-screen bg-[#E3E8EF] flex flex-col relative sm:neu-flat sm:my-4 sm:min-h-[calc(100vh-2rem)] sm:rounded-3xl sm:border sm:border-white/80 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
};

