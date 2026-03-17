import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
}

interface SparklesTextProps {
  text: string;
  sparklesCount?: number;
  colors?: { first: string; second: string; third: string };
  className?: string;
}

export default function SparklesText({
  text,
  sparklesCount = 8,
  colors = { first: '#0052CC', second: '#38BDF8', third: '#FF8C00' },
  className = '',
}: SparklesTextProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  useEffect(() => {
    const colorArr = [colors.first, colors.second, colors.third];
    const generateSparkles = () => {
      return Array.from({ length: sparklesCount }, (_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 6 + 3,
        color: colorArr[i % colorArr.length],
        delay: Math.random() * 2,
      }));
    };
    setSparkles(generateSparkles());
    const interval = setInterval(() => setSparkles(generateSparkles()), 3000);
    return () => clearInterval(interval);
  }, [sparklesCount, colors.first, colors.second, colors.third]);

  return (
    <span className={`relative inline-block ${className}`}>
      <span className="relative z-10 font-display text-[#0F172A]">{text}</span>
      <AnimatePresence>
        {sparkles.map((sparkle) => (
          <motion.svg
            key={sparkle.id}
            className="pointer-events-none absolute z-20"
            style={{
              left: `${sparkle.x}%`,
              top: `${sparkle.y}%`,
              width: sparkle.size,
              height: sparkle.size,
            }}
            viewBox="0 0 24 24"
            fill={sparkle.color}
            initial={{ opacity: 0, scale: 0, rotate: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], rotate: [0, 180] }}
            transition={{ duration: 1.5, delay: sparkle.delay, ease: 'easeInOut' }}
            exit={{ opacity: 0, scale: 0 }}
          >
            <path d="M12 0L14.59 8.41L23 12L14.59 15.59L12 24L9.41 15.59L1 12L9.41 8.41Z" />
          </motion.svg>
        ))}
      </AnimatePresence>
    </span>
  );
}
