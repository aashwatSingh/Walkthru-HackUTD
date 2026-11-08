import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen } from 'lucide-react';

export function Logo({ to = '/', className = '' }) {
  return (
    <Link to={to} className={`group flex items-center gap-2.5 font-heading font-bold tracking-tight ${className}`}>
      <span className="flex size-9 -rotate-6 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
        <DoorOpen className="size-5" />
      </span>
      <span className="text-xl">Walkthrough</span>
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

// Headline words that pop in one by one; `highlight` words get the lime chip.
export function PopWords({ text, highlight = [], startDelay = 0 }) {
  return text.split(' ').map((word, i) => (
    <span key={i} className="inline-block whitespace-nowrap">
      <span
        className={highlight.includes(word)
          ? 'animate-pop relative mx-[0.08em] inline-block -rotate-2 rounded-xl bg-primary px-[0.15em] text-primary-foreground'
          : 'animate-pop inline-block'}
        style={{ animationDelay: `${startDelay + i * 90}ms` }}
      >
        {word}
      </span>
      {' '}
    </span>
  ));
}
