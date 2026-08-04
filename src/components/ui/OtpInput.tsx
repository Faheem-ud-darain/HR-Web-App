'use client';

import React, { useRef, useEffect } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OtpInput({ length = 6, value, onChange, disabled = false }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const digits = Array.from({ length }, (_, i) => value[i] || '');

  // Auto focus first empty input or initial box when mounted
  useEffect(() => {
    if (!disabled && inputsRef.current[0]) {
      const firstEmptyIndex = digits.findIndex(d => !d);
      const targetIndex = firstEmptyIndex !== -1 ? firstEmptyIndex : length - 1;
      inputsRef.current[targetIndex]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value;
    const cleanNum = val.replace(/\D/g, '');

    if (!cleanNum) {
      const nextDigits = [...digits];
      nextDigits[index] = '';
      onChange(nextDigits.join(''));
      return;
    }

    if (cleanNum.length === 1) {
      const nextDigits = [...digits];
      nextDigits[index] = cleanNum;
      const combined = nextDigits.join('');
      onChange(combined);

      if (index < length - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    } else if (cleanNum.length > 1) {
      const pasted = cleanNum.slice(0, length);
      onChange(pasted);
      const nextFocus = Math.min(pasted.length, length - 1);
      inputsRef.current[nextFocus]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
        const nextDigits = [...digits];
        nextDigits[index - 1] = '';
        onChange(nextDigits.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const nextFocus = Math.min(pastedData.length, length - 1);
      inputsRef.current[nextFocus]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 max-w-xs mx-auto my-2">
      {Array.from({ length }).map((_, index) => {
        const digit = digits[index] || '';
        const isFilled = Boolean(digit);

        return (
          <input
            key={index}
            ref={(el) => { inputsRef.current[index] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            className={`
              w-10 h-12 sm:w-11 sm:h-13 text-center text-lg sm:text-xl font-bold rounded-xl border
              transition-all outline-none select-none
              ${disabled ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : ''}
              ${!disabled && isFilled ? 'bg-orange-50/50 border-orange-500 text-orange-950 shadow-sm ring-1 ring-orange-200' : ''}
              ${!disabled && !isFilled ? 'bg-slate-50/60 border-slate-200 text-slate-900 hover:border-slate-300 focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-100' : ''}
            `}
          />
        );
      })}
    </div>
  );
}
