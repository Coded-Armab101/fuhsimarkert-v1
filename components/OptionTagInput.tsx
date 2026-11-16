'use client';

import React, { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cleanOption, optionList } from '@/utils/variants';

/**
 * Free-text option editor for a product's sizes/colours. Sellers type the
 * values that apply to THIS product (S/M/L, 128GB/256GB, Red/Black) instead of
 * picking from a fixed global list.
 */
export default function OptionTagInput({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const add = () => {
    const next = optionList([...value, draft]);
    setDraft('');
    if (next.length !== value.length || next.some((item, i) => item !== value[i])) {
      onChange(next);
    }
  };

  const remove = (option: string) => {
    onChange(value.filter((item) => item !== option));
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-xs font-mono text-neutral-300">{label}</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((option) => (
            <span
              key={option}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-200"
            >
              {option}
              <button
                type="button"
                onClick={() => remove(option)}
                aria-label={`Remove ${option}`}
                className="text-neutral-500 transition-colors hover:text-red-400"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          // Each saved option is capped at 40 characters. A longer draft is
          // allowed so a seller can paste a comma-separated list in one go.
          maxLength={400}
          placeholder={placeholder}
          aria-describedby={hintId}
          disabled={value.length >= 20}
          className="min-w-0 flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-600"
        />
        <button
          type="button"
          onClick={add}
          disabled={!cleanOption(draft) || value.length >= 20}
          className="inline-flex items-center gap-1 rounded-xl border border-neutral-700 px-3 text-[11px] font-bold text-neutral-200 transition-colors hover:border-red-600 hover:text-red-400 disabled:opacity-40"
        >
          <Plus size={13} /> Add
        </button>
      </div>
      <p id={hintId} className="text-[10px] text-neutral-500 font-mono">
        {value.length >= 20
          ? 'Maximum of 20 options reached.'
          : hint || 'Press Enter after each option. You can also paste a comma-separated list.'}
      </p>
    </div>
  );
}
