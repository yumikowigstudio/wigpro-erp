'use client'
import { useAuth } from './useAuth'
import { toast } from 'sonner'

interface AppointmentData {
  customerName:  string
  customerPhone: string
  services:      string
  stylistName:   string
  stylistEmail?: string  // เพิ่ม attendee ช่างใน Google Calendar
  date:          string  // YYYY-MM-DD
  startTime:     string  // HH:mm
  endTime:       string  // HH:mm
  branchName:    string
  notes?:        string
}

export function useGoogleCalendar() {
  const { user } = useAuth()

  const isConnected = !!(user as unknown as Record<string, unknown> & { googleConnected?: boolean })?.googleConnected

  // เริ่ม OAuth flow — เปิดหน้า Google Login
  const connectGoogle = () => {
    if (!user?.id) return
    window.location.href = `/api/auth/google?userId=${user.id}`
  }

  // สร้าง Calendar Event จากนัดหมาย
  const syncAppointment = async (
    appointmentId: string,
    appointment: AppointmentData,
  ): Promise<string | null> => {
    if (!user?.id || !isConnected) return null

    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, appointmentId, appointment }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Sync Google Calendar แล้ว ✅')
        return data.eventId
      }
      throw new Error(data.error)
    } catch (err) {
      console.error('Calendar sync error:', err)
      toast.error('ไม่สามารถ Sync Google Calendar ได้')
      return null
    }
  }

  // อัพเดท event ที่มีอยู่
  const updateEvent = async (
    eventId: string,
    appointment: AppointmentData,
  ): Promise<boolean> => {
    if (!user?.id || !isConnected) return false

    try {
      const res = await fetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, eventId, appointment }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('อัพเดท Calendar แล้ว ✅')
        return true
      }
      throw new Error(data.error)
    } catch (err) {
      console.error('Calendar update error:', err)
      toast.error('ไม่สามารถอัพเดท Calendar ได้')
      return false
    }
  }

  // ลบ event
  const deleteEvent = async (eventId: string): Promise<boolean> => {
    if (!user?.id || !isConnected) return false

    try {
      const res = await fetch(
        `/api/calendar?userId=${user.id}&eventId=${eventId}`,
        { method: 'DELETE' },
      )
      const data = await res.json()
      if (data.success) {
        toast.success('ลบออกจาก Calendar แล้ว')
        return true
      }
      throw new Error(data.error)
    } catch (err) {
      console.error('Calendar delete error:', err)
      toast.error('ไม่สามารถลบออกจาก Calendar ได้')
      return false
    }
  }

  return { isConnected, connectGoogle, syncAppointment, updateEvent, deleteEvent }
}
