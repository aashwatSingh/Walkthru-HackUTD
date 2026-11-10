import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';

// The mark: a viewfinder reticle, the same corner brackets that frame every evidence photo.
export function Mark({ size = 36, className = '' }) {
  return (
    <span style={{ width: size, height: size }}
      className={`viewfinder viewfinder-sm flex shrink-0 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 text-neon transition-[box-shadow,border-color,background-color] duration-200 ${className}`}>
      <ScanLine size={Math.round(size / 2)} />
    </span>
  );
}

export function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`group flex items-center gap-2.5 rounded-md ${className}`}>
      <Mark className="group-hover:border-cyan-300 group-hover:bg-cyan-400/20 group-hover:shadow-[0_0_18px_rgb(0_240_255/0.45)]" />
      <span className="display text-[17px] tracking-[-0.01em]">Walkthrough</span>
    </Link>
  );
}

// Scroll reveal that can never ship a blank section: content is visible by default, and only elements that
// start below the fold are hidden, then revealed when they scroll in (or after a safety timeout).
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null);
  const [state, setState] = useState('shown');
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return undefined; // already on screen: never hide
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
    <Tag ref={ref} data-reveal={state} className={className} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

// True once the element has scrolled into view (used to start an animation only when it can be seen).
export function useInView(threshold = 0.3) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen];
}
