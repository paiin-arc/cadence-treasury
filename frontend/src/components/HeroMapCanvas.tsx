import { useEffect, useRef } from "react";

interface CityNode {
  name: string;
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  region: string;
}

const CITIES: CityNode[] = [
  { name: "San Francisco", x: 18, y: 35, region: "US-West" },
  { name: "New York", x: 28, y: 32, region: "US-East" },
  { name: "London", x: 48, y: 26, region: "EU" },
  { name: "Zurich", x: 52, y: 28, region: "EU" },
  { name: "Dubai", x: 62, y: 40, region: "MENA" },
  { name: "Singapore", x: 78, y: 55, region: "APAC" },
  { name: "Tokyo", x: 86, y: 34, region: "APAC" },
  { name: "Sydney", x: 89, y: 76, region: "OCE" },
];

const ROUTES = [
  [0, 1], // SF -> NYC
  [1, 2], // NYC -> London
  [2, 3], // London -> Zurich
  [3, 4], // Zurich -> Dubai
  [4, 5], // Dubai -> Singapore
  [5, 6], // Singapore -> Tokyo
  [1, 5], // NYC -> Singapore
  [2, 6], // London -> Tokyo
  [6, 7], // Tokyo -> Sydney
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  pulseSpeed: number;
}

export default function HeroMapCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 600);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener("resize", handleResize);

    // Floating USDC background particles
    const bgParticles: Particle[] = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -Math.random() * 0.4 - 0.1,
      radius: Math.random() * 2 + 1,
      alpha: Math.random() * 0.4 + 0.1,
      pulseSpeed: Math.random() * 0.02 + 0.005,
    }));

    // Flow pulses traveling along routes
    interface RoutePulse {
      routeIndex: number;
      progress: number;
      speed: number;
      color: string;
      valueText: string;
    }

    const COLORS = ["#a855f7", "#3b82f6", "#38bdf8", "#c084fc", "#10b981"];
    const VALUES = ["$10,000", "$45,200", "$120,000", "$2,500", "$8,400"];

    const routePulses: RoutePulse[] = ROUTES.map((_, i) => ({
      routeIndex: i,
      progress: Math.random(),
      speed: 0.003 + Math.random() * 0.004,
      color: COLORS[i % COLORS.length],
      valueText: VALUES[i % VALUES.length],
    }));

    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // Draw grid overlay
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw floating background USDC particles
      bgParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += Math.sin(frame * p.pulseSpeed) * 0.005;

        if (p.y < 0) {
          p.y = height;
          p.x = Math.random() * width;
        }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(168, 85, 247, ${Math.max(0.05, Math.min(0.6, p.alpha))})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#a855f7";
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Calculate pixel coordinates for city nodes
      const cityCoords = CITIES.map((c) => ({
        ...c,
        px: (c.x / 100) * width,
        py: (c.y / 100) * height,
      }));

      // Draw routes (arcs)
      ROUTES.forEach(([startIndex, endIndex]) => {
        const start = cityCoords[startIndex];
        const end = cityCoords[endIndex];

        const midX = (start.px + end.px) / 2;
        const midY = (start.py + end.py) / 2 - 40; // curve upwards

        ctx.beginPath();
        ctx.moveTo(start.px, start.py);
        ctx.quadraticCurveTo(midX, midY, end.px, end.py);
        ctx.strokeStyle = "rgba(147, 51, 234, 0.18)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Draw route pulses (moving glowing dots)
      routePulses.forEach((pulse) => {
        const [startIndex, endIndex] = ROUTES[pulse.routeIndex];
        const start = cityCoords[startIndex];
        const end = cityCoords[endIndex];

        pulse.progress += pulse.speed;
        if (pulse.progress > 1) {
          pulse.progress = 0;
        }

        const t = pulse.progress;
        const midX = (start.px + end.px) / 2;
        const midY = (start.py + end.py) / 2 - 40;

        // Quadratic bezier formula
        const currX = (1 - t) * (1 - t) * start.px + 2 * (1 - t) * t * midX + t * t * end.px;
        const currY = (1 - t) * (1 - t) * start.py + 2 * (1 - t) * t * midY + t * t * end.py;

        // Glowing particle head
        ctx.beginPath();
        ctx.arc(currX, currY, 4, 0, Math.PI * 2);
        ctx.fillStyle = pulse.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = pulse.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Trail effect
        for (let i = 1; i <= 5; i++) {
          const prevT = Math.max(0, t - i * 0.015);
          const px = (1 - prevT) * (1 - prevT) * start.px + 2 * (1 - prevT) * prevT * midX + prevT * prevT * end.px;
          const py = (1 - prevT) * (1 - prevT) * start.py + 2 * (1 - prevT) * prevT * midY + prevT * prevT * end.py;

          ctx.beginPath();
          ctx.arc(px, py, Math.max(1, 4 - i * 0.6), 0, Math.PI * 2);
          ctx.fillStyle = pulse.color;
          ctx.globalAlpha = 1 - i * 0.18;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      });

      // Draw city nodes
      cityCoords.forEach((city) => {
        // Outer pulsing ring
        const pulseR = 6 + Math.sin(frame * 0.05) * 3;
        ctx.beginPath();
        ctx.arc(city.px, city.py, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Inner solid node
        ctx.beginPath();
        ctx.arc(city.px, city.py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#38bdf8";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#38bdf8";
        ctx.fill();
        ctx.shadowBlur = 0;

        // City Label
        ctx.font = "10px 'Plus Jakarta Sans', sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.fillText(city.name, city.px + 8, city.py + 3);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-map-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
