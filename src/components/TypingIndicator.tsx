import { motion } from "motion/react";
import { cn } from "../lib/utils";

export function TypingIndicator({ size = 28, className, isAnimating = true }: { size?: number, className?: string, isAnimating?: boolean }) {
  // 4 intersecting angles to create a beautifully complex wireframe lotus/atomic shape
  const angles = [0, 45, 90, 135];

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <motion.svg 
        width={size} height={size} viewBox="0 0 24 24" 
        fill="none" strokeWidth="1.25" strokeLinecap="round"
        animate={isAnimating ? { rotate: 360 } : { rotate: 0 }}
        transition={isAnimating ? { duration: 18, repeat: Infinity, ease: "linear" } : { duration: 0.5, ease: "easeOut" }}
      >
        {/* Soft Glowing Center Core */}
        <motion.circle 
          cx="12" cy="12" r="1.5" fill="var(--privora-text)" stroke="none"
          animate={isAnimating ? { opacity: [0.3, 1, 0.3], scale: [0.7, 1.4, 0.7] } : { opacity: 0.8, scale: 1 }}
          transition={isAnimating ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
        />

        {angles.map((angle, i) => (
          <motion.g key={angle} transform={`rotate(${angle} 12 12)`}>
            {/* Subtle deeply dark ghost track to ground the animation */}
            <ellipse cx="12" cy="12" rx="3.5" ry="10.5" stroke="var(--privora-muted)" opacity={isAnimating ? "0.3" : "0.1"} />
            
            {/* Primary elegant sweeping light trails */}
            <motion.ellipse 
              cx="12" cy="12" rx="3.5" ry="10.5" 
              stroke="var(--privora-text)"
              initial={{ pathLength: 0.05, pathOffset: 0 }}
              animate={isAnimating ? { 
                pathLength: [0.05, 0.65, 0.05],
                pathOffset: [0, 1, 2]
              } : { pathLength: 1, pathOffset: 0 }}
              transition={isAnimating ? { 
                duration: 3, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: i * 0.25 // Smooth cascade stagger for weaving effect
              } : { duration: 0.5, ease: "easeOut" }}
            />
          </motion.g>
        ))}
      </motion.svg>
    </div>
  );
}
