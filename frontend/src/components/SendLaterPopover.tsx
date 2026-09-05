'use client';

import { useState, useRef, useEffect } from 'react';
import { addDays, setHours, setMinutes, setSeconds, format } from 'date-fns';

interface SendLaterPopoverProps {
  onClose: () => void;
  onConfirm: (isoTime: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SendLaterPopover — Floating card matching Figma Screen 6
// Date/time picker + Tomorrow presets + Cancel/Done buttons
// ─────────────────────────────────────────────────────────────────────────────
export function SendLaterPopover({ onClose, onConfirm }: SendLaterPopoverProps) {
  const [customDate, setCustomDate] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Preset times
  const presets = [
    { label: 'Tomorrow', time: tomorrowAt(8, 0) },
    { label: 'Tomorrow, 10:00 AM', time: tomorrowAt(10, 0) },
    { label: 'Tomorrow, 11:00 AM', time: tomorrowAt(11, 0) },
    { label: 'Tomorrow, 3:00 PM', time: tomorrowAt(15, 0) },
  ];

  const handlePreset = (isoTime: string) => {
    onConfirm(isoTime);
  };

  const handleDone = () => {
    if (customDate) {
      onConfirm(new Date(customDate).toISOString());
    } else {
      onConfirm(presets[0].time);
    }
  };

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-10 w-[260px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-[#E8E8E8] z-50 slide-down"
    >
      <div className="px-4 pt-4 pb-3">
        {/* Title */}
        <p className="text-[13px] font-semibold text-[#1A1A1A] mb-3">Send Later</p>

        {/* Date/time picker */}
        <div className="relative mb-3">
          <input
            type="datetime-local"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            placeholder="Pick date & time"
            className="w-full h-[34px] pl-3 pr-8 text-[12px] text-[#1A1A1A] placeholder-[#9E9E9E]
                       bg-[#F5F5F5] rounded-lg border-none outline-none
                       focus:bg-[#EFEFEF] transition-colors"
          />
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="absolute right-2.5 top-2.5 text-[#9E9E9E] pointer-events-none"
          >
            <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M4.5 1V4M9.5 1V4M1.5 6H12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Presets */}
        <div className="space-y-0.5">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset.time)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] text-[#1A1A1A]
                         hover:bg-[#F5F5F5] transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-4 pb-4 pt-2 border-t border-[#F0F0F0]">
        <button
          onClick={onClose}
          className="text-[13px] text-[#666666] hover:text-[#1A1A1A] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleDone}
          className="h-[30px] px-4 rounded-full border border-[#00A859] text-[#00A859]
                     text-[12px] font-medium hover:bg-[#E8F7EF] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function tomorrowAt(hour: number, minute: number): string {
  let d = addDays(new Date(), 1);
  d = setHours(d, hour);
  d = setMinutes(d, minute);
  d = setSeconds(d, 0);
  return d.toISOString();
}
