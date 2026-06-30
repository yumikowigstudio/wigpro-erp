// อัปโหลดรูปขึ้น Cloudinary (unsigned preset) — ใช้ร่วมกันทั้งแอป
const CLOUDINARY_CLOUD  = 'dqea32qab'
const CLOUDINARY_PRESET = 'wigpro_products'

export async function uploadToCloudinary(file: File, folder = 'wigpro/uploads'): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', CLOUDINARY_PRESET)
  fd.append('folder', folder)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ')
  return ((await res.json()) as { secure_url: string }).secure_url
}
