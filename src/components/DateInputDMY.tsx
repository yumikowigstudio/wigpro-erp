'use client'

import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { displayDateToIso, isoDateToDisplay, maskDisplayDate } from '@/lib/dateFormat'

interface DateInputDMYProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  min?: string
  className?: string
}

export function DateInputDMY({ value, onChange, ariaLabel, min, className = '' }: DateInputDMYProps) {
  const [displayValue, setDisplayValue] = useState(() => isoDateToDisplay(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setDisplayValue(isoDateToDisplay(value))
    setInvalid(false)
  }, [value])

  const applyDisplayValue = (nextValue: string) => {
    const maskedValue = maskDisplayDate(nextValue)
    setDisplayValue(maskedValue)
    if (!maskedValue) {
      setInvalid(false)
      onChange('')
      return
    }
    if (maskedValue.length < 10) {
      setInvalid(false)
      return
    }
    const isoValue = displayDateToIso(maskedValue)
    const isInvalid = !isoValue || Boolean(min && isoValue < min)
    setInvalid(isInvalid)
    if (!isInvalid && isoValue) onChange(isoValue)
  }

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={displayValue}
          onChange={event => applyDisplayValue(event.target.value)}
          onBlur={() => setInvalid(Boolean(displayValue) && (!displayDateToIso(displayValue) || Boolean(min && displayDateToIso(displayValue)! < min)))}
          placeholder="DD/MM/YYYY"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          className={`${className} pr-11 ${invalid ? 'border-red-400 focus:ring-red-200' : ''}`}
        />
        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="date"
          value={value}
          min={min}
          onChange={event => onChange(event.target.value)}
          aria-label={`${ariaLabel} จากปฏิทิน`}
          title="เลือกวันที่จากปฏิทิน"
          className="absolute right-0 top-0 h-full w-11 cursor-pointer opacity-0"
        />
      </div>
      {invalid && (
        <p className="mt-1 text-[11px] text-red-600">
          กรุณากรอกวันที่เป็น วัน/เดือน/ปี{min ? ' และไม่เลือกวันที่ย้อนหลัง' : ''}
        </p>
      )}
    </div>
  )
}
