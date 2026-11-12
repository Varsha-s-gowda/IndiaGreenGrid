import { Link } from "react-router-dom";
import {
  BrainCircuit,
  ChartNoAxesColumnIncreasing,
  Leaf,
  Sprout,
  Sun,
  Users,
} from "lucide-react";
import LoginIllustration from "./LoginIllustration";

const FEATURES = [
  {
    icon: Leaf,
    title: "Clean Energy",
    description: "Renewable intelligence",
  },
  {
    icon: BrainCircuit,
    title: "Smart Decisions",
    description: "Data-backed planning",
  },
  {
    icon: Sprout,
    title: "A Greener Tomorrow",
    description: "Measurable impact",
  },
];

const FLOATING_ICONS = [
  {
    icon: Sun,
    className: "right-[4%] top-[7%]",
    delay: "0s",
  },
  {
    icon: Users,
    className: "right-[0.5%] top-[31%]",
    delay: "-2.3s",
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    className: "right-[6%] top-[55%]",
    delay: "-4.6s",
  },
];

export default function LoginBrandPanel() {
  return (
    <div className="login-hero relative flex h-full w-full flex-col overflow-hidden px-10 pb-0 pt-9 xl:px-14 xl:pt-10">
      <div className="login-hero-aurora" aria-hidden="true" />
      <div className="login-hero-beam" aria-hidden="true" />

      {/* Soft concentric circular pattern */}
      <svg
        className="pointer-events-none absolute -right-24 -top-24 h-[30rem] w-[30rem] text-emerald-200/[0.09]"
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="200" cy="200" r="196" stroke="currentColor" strokeWidth="1" />
        <circle cx="200" cy="200" r="154" stroke="currentColor" strokeWidth="1" />
        <circle
          cx="200"
          cy="200"
          r="112"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
        <circle cx="200" cy="200" r="72" stroke="currentColor" strokeWidth="1" />
      </svg>

      {/* Decorative leaf silhouettes */}
      <svg
        className="pointer-events-none absolute -bottom-10 -left-12 h-72 w-72 text-emerald-300/[0.1]"
        viewBox="0 0 240 240"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M232 8C150 26 82 66 44 124c-14 22-22 48-24 76 38-10 72-30 98-60 30-34 46-78 50-124 1-6 1-8 0-8Z"
          fill="currentColor"
        />
        <path
          d="M8 236C44 162 104 104 180 68"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>

      <Link to="/login" className="relative z-30 inline-flex w-fit items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
          <Sun size={21} strokeWidth={2.2} />
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-tight text-white">
            India Green Grid
          </span>
          <span className="block text-[11px] text-emerald-200/90">
            National renewable decision support
          </span>
        </span>
      </Link>

      <div className="relative z-20 mt-8 max-w-[30rem] xl:mt-11">
        <h2 className="text-[clamp(2.25rem,4.2vw,3.6rem)] font-bold leading-[1.02] tracking-[-0.02em] text-white">
          <span className="block">Powering</span>
          <span className="relative mt-1 block w-fit">
            <span className="bg-gradient-to-r from-white via-emerald-100 to-emerald-300 bg-clip-text text-transparent">
              India&apos;s transition
            </span>
            <span
              className="pointer-events-none absolute -bottom-2.5 left-0 h-px w-full bg-gradient-to-r from-emerald-300/0 via-emerald-300/80 to-emerald-300/0"
              aria-hidden="true"
            />
            <svg
              className="absolute -bottom-3.5 left-0 h-3 w-full text-emerald-300/70 drop-shadow-[0_0_10px_rgba(52,211,153,0.45)]"
              viewBox="0 0 240 12"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 8.5C58 3.5 120 3 177 5.5c24 1 45 1.5 60 .5"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </h2>

        <p className="mt-6 max-w-[23rem] text-[14px] leading-6 text-emerald-100/75 xl:text-[15px] xl:leading-7">
          National energy intelligence, compliance, opportunity discovery and
          community solar for one honest decision-support platform.
        </p>

        <ul className="mt-7 grid grid-cols-3 gap-3 xl:mt-8">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li key={title} className="min-w-0">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-emerald-200 ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="mt-2.5 block text-[11px] font-semibold leading-4 text-white">
                {title}
              </span>
              <span className="mt-0.5 block text-[10px] leading-4 text-emerald-100/60">
                {description}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Illustration + floating glass icons */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-[54%] items-end justify-center">
        <div className="relative aspect-[960/520] max-h-full w-full max-w-[68rem]">
          <LoginIllustration className="absolute inset-0 h-full w-full" />

          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M90 12C99 20 99 26 94.5 35c-4 8-4 15-5.5 23"
              fill="none"
              stroke="rgba(167, 243, 208, 0.28)"
              strokeWidth="0.4"
              strokeDasharray="1 2.4"
              strokeLinecap="round"
            />
          </svg>

          {FLOATING_ICONS.map(({ icon: Icon, className, delay }, index) => (
            <span
              key={index}
              className={`login-float-icon absolute flex h-12 w-12 items-center justify-center rounded-2xl text-emerald-200 xl:h-14 xl:w-14 ${className}`}
              style={{ animationDelay: delay }}
              aria-hidden="true"
            >
              <Icon size={21} strokeWidth={1.9} className="xl:h-6 xl:w-6" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
