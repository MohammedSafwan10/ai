import { motion } from "motion/react";

export function TypingIndicator() {
  // 4 intersecting angles to create a beautifully complex wireframe lotus/atomic shape
  const angles = [0, 45, 90, 135];

  return (
    <div className="flex items-center h-8 my-2">
      <motion.svg 
        width="28" height="28" viewBox="0 0 24 24" 
        fill="none" strokeWidth="1.25" strokeLinecap="round"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        {/* Soft Glowing Center Core */}
        <motion.circle 
          cx="12" cy="12" r="1.5" fill="var(--nexus-text)" stroke="none"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.7, 1.4, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        {angles.map((angle, i) => (
          <motion.g key={angle} transform={`rotate(${angle} 12 12)`}>
            {/* Subtle deeply dark ghost track to ground the animation */}
            <ellipse cx="12" cy="12" rx="3.5" ry="10.5" stroke="var(--nexus-muted)" opacity="0.3" />
            
            {/* Primary elegant sweeping light trails */}
            <motion.ellipse 
              cx="12" cy="12" rx="3.5" ry="10.5" 
              stroke="var(--nexus-text)"
              initial={{ pathLength: 0.05, pathOffset: 0 }}
              animate={{ 
                pathLength: [0.05, 0.65, 0.05],
                pathOffset: [0, 1, 2]
              }}
              transition={{ 
                duration: 3, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: i * 0.25 // Smooth cascade stagger for weaving effect
              }}
            />
          </motion.g>
        ))}
      </motion.svg>
    </div>
  );
}
