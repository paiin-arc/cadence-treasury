import { useEffect, useState, useRef } from "react";
import { useInView } from "framer-motion";

interface StatCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

export default function StatCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 2000,
}: StatCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!isInView) return;

    let startTime: number | null = null;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Ease out expo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(easeProgress * value));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      }
    };

    animationFrame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, value, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}
