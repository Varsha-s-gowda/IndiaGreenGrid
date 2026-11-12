const PARTICLES = [
  { left: "4%", size: 5, delay: -3, duration: 28, drift: "26px", opacity: 0.28 },
  { left: "11%", size: 3, delay: -16, duration: 34, drift: "-18px", opacity: 0.22 },
  { left: "18%", size: 6, delay: -8, duration: 31, drift: "32px", opacity: 0.3 },
  { left: "26%", size: 3, delay: -22, duration: 38, drift: "-24px", opacity: 0.2 },
  { left: "33%", size: 4, delay: -5, duration: 26, drift: "16px", opacity: 0.26 },
  { left: "41%", size: 5, delay: -18, duration: 35, drift: "-30px", opacity: 0.24 },
  { left: "49%", size: 3, delay: -11, duration: 30, drift: "22px", opacity: 0.22 },
  { left: "57%", size: 6, delay: -25, duration: 40, drift: "-20px", opacity: 0.26 },
  { left: "64%", size: 4, delay: -7, duration: 29, drift: "28px", opacity: 0.3 },
  { left: "71%", size: 3, delay: -14, duration: 33, drift: "-16px", opacity: 0.2 },
  { left: "79%", size: 5, delay: -2, duration: 27, drift: "24px", opacity: 0.28 },
  { left: "86%", size: 4, delay: -20, duration: 36, drift: "-28px", opacity: 0.22 },
  { left: "93%", size: 6, delay: -9, duration: 32, drift: "18px", opacity: 0.26 },
  { left: "97%", size: 3, delay: -27, duration: 41, drift: "-22px", opacity: 0.18 },
];

export default function SolarBackdrop({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`solar-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden ${className}`}
    >
      <div className="solar-aurora solar-aurora--one" />
      <div className="solar-aurora solar-aurora--two" />
      <div className="solar-aurora solar-aurora--three" />

      <div className="absolute inset-0">
        {PARTICLES.map((particle, index) => (
          <span
            key={index}
            className="solar-particle"
            style={{
              left: particle.left,
              width: particle.size,
              height: particle.size,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              "--particle-drift": particle.drift,
              "--particle-opacity": particle.opacity,
            }}
          />
        ))}
      </div>
    </div>
  );
}
