import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  trend?: { value: number; label: string }
  color?: 'pink' | 'purple' | 'blue' | 'green' | 'amber' | 'teal'
  className?: string
}

const colorMap = {
  pink:   { icon: 'from-[#f472b6] to-[#e879a0]', shadow: 'shadow-pink-200',   value: 'text-[#e44d82]',  bg: 'bg-[#fff0f6]' },
  purple: { icon: 'from-[#c084fc] to-[#a855f7]', shadow: 'shadow-purple-200', value: 'text-[#9333ea]',  bg: 'bg-[#faf5ff]' },
  blue:   { icon: 'from-[#60a5fa] to-[#3b82f6]', shadow: 'shadow-blue-200',   value: 'text-[#2563eb]',  bg: 'bg-[#eff6ff]' },
  green:  { icon: 'from-[#4ade80] to-[#22c55e]', shadow: 'shadow-green-200',  value: 'text-[#16a34a]',  bg: 'bg-[#f0fdf4]' },
  amber:  { icon: 'from-[#fbbf24] to-[#f59e0b]', shadow: 'shadow-amber-200',  value: 'text-[#d97706]',  bg: 'bg-[#fffbeb]' },
  teal:   { icon: 'from-[#2dd4bf] to-[#14b8a6]', shadow: 'shadow-teal-200',   value: 'text-[#0d9488]',  bg: 'bg-[#f0fdfa]' },
}

export default function StatCard({ title, value, subtitle, icon: Icon, trend, color = 'pink', className }: StatCardProps) {
  const c = colorMap[color]
  const isUp = trend && trend.value >= 0

  return (
    <div className={cn(
      'bg-white rounded-2xl p-5 border border-[var(--border-light)] shadow-[var(--shadow-card)] hover:shadow-md transition-all hover:-translate-y-0.5',
      className,
    )}>
      <div className="flex items-start justify-between mb-4">
        {/* Icon */}
        <div className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br shadow-md',
          c.icon, c.shadow,
        )}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {/* Trend badge */}
        {trend && (
          <span className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-full',
            isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500',
          )}>
            {isUp ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        )}
      </div>

      <p className={cn('text-2xl font-bold', c.value)}>{value}</p>
      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{title}</p>
      {subtitle && <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>}
      {trend && <p className="text-xs text-[var(--text-muted)] mt-0.5">{trend.label}</p>}
    </div>
  )
}
