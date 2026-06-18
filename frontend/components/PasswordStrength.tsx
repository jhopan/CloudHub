'use client';

import { Check, X } from 'lucide-react';

interface PasswordStrengthProps {
  password: string;
}

function getScore(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) score++;
  return score;
}

const config = [
  { label: 'Weak', color: 'bg-red-500' },
  { label: 'Weak', color: 'bg-red-500' },
  { label: 'Fair', color: 'bg-orange-500' },
  { label: 'Good', color: 'bg-yellow-500' },
  { label: 'Strong', color: 'bg-green-500' },
] as const;

const criteria = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase & lowercase', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'Number', test: (p: string) => /\d/.test(p) },
  { label: 'Special character', test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p) },
];

export default function PasswordStrength({ password }: PasswordStrengthProps) {
  const score = getScore(password);
  const { label, color } = config[score];

  if (!password) return null;

  return (
    <div className="space-y-2">
      {/* Progress bar segments */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < score ? color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Label */}
      <p className={`text-xs font-medium ${color.replace('bg-', 'text-')}`}>
        {label}
      </p>

      {/* Checklist */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {criteria.map(({ label: cLabel, test }) => {
          const passed = test(password);
          return (
            <li key={cLabel} className="flex items-center gap-1 text-xs">
              {passed ? (
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              )}
              <span className={passed ? 'text-gray-700' : 'text-gray-400'}>
                {cLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
