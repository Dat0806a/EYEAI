import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { FeatureCard } from '../components/ui/FeatureCard';
import { SpeakHeroCard } from '../components/home/SpeakHeroCard';
import { SosHeroCard } from '../components/home/SosHeroCard';
import { EntertainmentVisual } from '../components/home/EntertainmentVisual';
import { LocationVisual } from '../components/home/LocationVisual';
import { ContactsVisual } from '../components/home/ContactsVisual';
import { AiVisual } from '../components/home/AiVisual';
import { Avatar3D } from '../components/ui/Avatar3D';
import { motion } from 'motion/react';

interface HomePageProps {
  onNavigate: (route: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="min-h-screen bg-transparent text-[#14213D] flex flex-col pb-24 sm:pb-28 relative overflow-x-hidden selection:bg-[#6AC9F0] selection:text-[#14213D]">
      {/* Top Mobile Header */}
      <PageHeader onOpenSettings={() => onNavigate('settings')} />

      {/* Main Mobile Portrait Content Container */}
      <main className="flex-1 max-w-md md:max-w-xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 flex flex-col justify-center gap-4 sm:gap-5 z-10">
        
        {/* Subtle Minimal Reassuring Prompt Bar */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-between px-1 mb-0.5"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6AC9F0] animate-pulse" />
            <span className="text-xs sm:text-sm font-black text-[#14213D] tracking-tight">
              Bảng điều khiển giao tiếp
            </span>
          </div>
          <span className="text-[11px] font-bold text-[#3B4B68]">
            Chạm hoặc nhìn để chọn
          </span>
        </motion.div>

        {/* Primary Full-Width Action: Speak to People Around */}
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full"
        >
          <SpeakHeroCard
            row={0}
            col={0}
            onClick={() => onNavigate('speak')}
          />
        </motion.div>

        {/* 2-Column Primary Feature Grid with Distinct Visual Mini-Scenes */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-4 sm:gap-5 w-full"
        >
          {/* Feature 1: Giải trí */}
          <FeatureCard
            id="card-entertainment"
            title="Giải trí"
            description="Sách, radio & âm nhạc"
            visualNode={<EntertainmentVisual />}
            row={1}
            col={0}
            railColor="from-[#6AC9F0] via-[#6AC9F0]/50 to-transparent"
            onClick={() => onNavigate('entertainment')}
          />

          {/* Feature 2: Vị trí */}
          <FeatureCard
            id="card-location"
            title="Vị trí"
            description="Bản đồ & Định vị người thân"
            visualNode={<LocationVisual />}
            row={1}
            col={1}
            railColor="from-[#6AC9F0] via-emerald-400/50 to-transparent"
            onClick={() => onNavigate('location')}
          />

          {/* Feature 3: Liên lạc */}
          <FeatureCard
            id="card-contacts"
            title="Liên lạc"
            description="Người thân & Gọi khẩn"
            visualNode={<ContactsVisual />}
            row={2}
            col={0}
            railColor="from-[#FF6F61]/80 via-[#6AC9F0]/40 to-transparent"
            onClick={() => onNavigate('contacts')}
          />

          {/* Feature 4: AI Trợ lý */}
          <FeatureCard
            id="card-ai"
            title="AI Trợ lý"
            description="Trò chuyện & Hỗ trợ"
            visualNode={<AiVisual />}
            row={2}
            col={1}
            railColor="from-purple-400/80 via-[#6AC9F0]/50 to-transparent"
            onClick={() => onNavigate('ai')}
          />
        </motion.div>

        {/* SOS Emergency Hero Card - Full Width Action */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="w-full mt-0.5"
        >
          <SosHeroCard
            row={3}
            col={0}
            onClick={() => onNavigate('sos')}
          />
        </motion.div>

      </main>

      {/* Dedicated Integrated AI Avatar 3D Stage Anchored at Bottom-Right */}
      <Avatar3D onClick={() => onNavigate('ai')} />
    </div>
  );
}
