import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../i18n/LanguageContext';

export interface TourStep {
  targetSelector: string;
  title: string;
  text: string;
  waitFor: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

interface Props {
  steps: TourStep[];
  currentEvent: string | null;
  onEventConsumed: () => void;
  onComplete: () => void;
  onSkip: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 4;
const POLL_TIMEOUT = 2000;

export default function GuidedTour({ steps, currentEvent, onEventConsumed, onComplete, onSkip }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const pollRef = useRef<number>(0);
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onEventConsumedRef = useRef(onEventConsumed);
  onEventConsumedRef.current = onEventConsumed;
  const { t } = useTranslation();

  const step = steps[stepIndex];

  // Find and track target element position
  const updateRect = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  }, [step]);

  // Poll for target element if not in DOM yet (or if it disappears mid-step)
  const hadTargetRef = useRef(false);
  useEffect(() => {
    hadTargetRef.current = false;
    updateRect();
    const el = document.querySelector(step?.targetSelector || '');
    if (el) { hadTargetRef.current = true; return; }

    const start = Date.now();
    let rafId = 0;
    const poll = () => {
      if (Date.now() - start > POLL_TIMEOUT) {
        onSkipRef.current(); // target never appeared — abort tour
        return;
      }
      const found = document.querySelector(step?.targetSelector || '');
      if (found) {
        hadTargetRef.current = true;
        updateRect();
      } else {
        rafId = requestAnimationFrame(poll);
      }
    };
    rafId = requestAnimationFrame(poll);
    pollRef.current = rafId;
    return () => cancelAnimationFrame(rafId);
  }, [step, updateRect]);

  // Abort if target disappears after being found (e.g. user deletes item mid-tour)
  useEffect(() => {
    if (targetRect !== null || !hadTargetRef.current) return;
    // Target was found before but is now gone — start abort timer
    const timer = setTimeout(() => {
      // Re-check: maybe it came back (e.g. re-render)
      const el = document.querySelector(step?.targetSelector || '');
      if (!el) onSkipRef.current();
    }, POLL_TIMEOUT);
    return () => clearTimeout(timer);
  }, [targetRect, step]);

  // Reposition on resize/scroll
  useEffect(() => {
    const observer = new ResizeObserver(updateRect);
    observer.observe(document.body);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [updateRect]);

  // Escape key to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkipRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Advance on matching event
  const advance = useCallback(() => {
    onEventConsumedRef.current();
    if (stepIndex >= steps.length - 1) {
      onCompleteRef.current();
    } else {
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, steps.length]);

  useEffect(() => {
    if (!currentEvent || !step) return;
    if (currentEvent !== step.waitFor) return;
    advance();
  }, [currentEvent, step, advance]);

  if (!step || !targetRect) return null;

  const pos = step.tooltipPosition || 'bottom';
  const tooltipStyle = computeTooltipStyle(targetRect, pos);

  return createPortal(
    <div className="guided-tour-overlay" onClick={e => e.stopPropagation()}>
      <div
        className="guided-tour-highlight"
        style={{
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
        }}
      />
      <div className={`guided-tour-tooltip guided-tour-tooltip--${pos}`} style={tooltipStyle}>
        <div className="guided-tour-tooltip-title">{step.title}</div>
        <div className="guided-tour-tooltip-text">{step.text}</div>
        {step.waitFor === 'tour-acknowledged' && (
          <button className="guided-tour-tooltip-ack" onClick={advance}>
            {t('tour.acknowledged_button')}
          </button>
        )}
        <div className="guided-tour-tooltip-footer">
          <span className="guided-tour-tooltip-skip" onClick={() => onSkipRef.current()}>
            {t('tour.skip')}
          </span>
          <span className="guided-tour-tooltip-step">
            {stepIndex + 1}/{steps.length}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const TOOLTIP_WIDTH = 300;
const TOOLTIP_MIN_HEIGHT = 120;
const MARGIN = 12;

function computeTooltipStyle(rect: Rect, pos: string): React.CSSProperties {
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Clamp horizontal center so tooltip stays within viewport
  const clampX = (centerX: number): number => {
    const half = TOOLTIP_WIDTH / 2;
    return Math.max(MARGIN + half, Math.min(vw - MARGIN - half, centerX));
  };

  // Clamp vertical position
  const clampY = (y: number): number => Math.max(MARGIN, Math.min(vh - MARGIN - TOOLTIP_MIN_HEIGHT, y));

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  switch (pos) {
    case 'top':
      return { bottom: vh - rect.top + gap, left: clampX(centerX), transform: 'translateX(-50%)' };
    case 'left': {
      const left = rect.left - gap - TOOLTIP_WIDTH;
      // Fall back to right if no space on left
      if (left < MARGIN) {
        return { top: clampY(centerY), left: rect.left + rect.width + gap, transform: 'translateY(-50%)' };
      }
      return { top: clampY(centerY), left, transform: 'translateY(-50%)' };
    }
    case 'right': {
      const left = rect.left + rect.width + gap;
      // Fall back to left if no space on right
      if (left + TOOLTIP_WIDTH > vw - MARGIN) {
        return { top: clampY(centerY), left: rect.left - gap - TOOLTIP_WIDTH, transform: 'translateY(-50%)' };
      }
      return { top: clampY(centerY), left, transform: 'translateY(-50%)' };
    }
    case 'bottom':
    default: {
      let top = rect.top + rect.height + gap;
      // Fall back to top if no space below
      if (top + TOOLTIP_MIN_HEIGHT > vh) {
        return { bottom: vh - rect.top + gap, left: clampX(centerX), transform: 'translateX(-50%)' };
      }
      return { top, left: clampX(centerX), transform: 'translateX(-50%)' };
    }
  }
}
