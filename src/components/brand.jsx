import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';

// Wordmark: a scanner reticle (the same corner brackets that frame every evidence photo) + the name.
export function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`group flex items-center gap-2.5 ${className}`}>
      <span className="hud-frame hud-frame-sm flex size-9 items-center justify-center rounded-[3px] border border-cyan-400/40 bg-cyan-400/10 text-neon transition-[box-shadow,border-color] duration-200 group-hover:border-cyan-400/80 group-hover:shadow-[0_0_14px_rgb(0_240_255/0.35)]">
        <ScanLine className="size-[18px]" />
      </span>
      <span className="leading-none">
        <span className="block font-heading text-lg font-bold tracking-[-0.02em]">Walkthrough</span>
        <span className="mt-0.5 block font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground">EVIDENCE_TERMINAL</span>
      </span>
    </Link>
  );
}

// Scroll reveal that can never ship a blank section: content is visible by default, and only elements that
// start below the fold are hidden, then revealed when they scroll in (or after a safety timeout).
export function Reveal({ children, delay = 0, tilt = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null);
  const [state, setState] = useState('shown');
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already on screen: never hide
    setState('waiting');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    const safety = setTimeout(() => setState('shown'), 6000);
    return () => { io.disconnect(); clearTimeout(safety); };
  }, []);
  return (
    <Tag ref={ref} data-reveal={state} className={className} style={{ transitionDelay: `${delay}ms`, '--reveal-tilt': `${tilt}deg` }}>
      {children}
    </Tag>
  );
}
