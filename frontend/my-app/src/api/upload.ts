import { translations } from '../i18n/translations'

const API_BASE = ''

// 上传接口使用 multipart/form-data，不能用通用 request 封装
export const uploadImage = async (file: File): Promise<string> => {
  const token = localStorage.getItem('token')
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/api/upload/image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json()
  if (!res.ok) {
    const lang = (localStorage.getItem('lang') as 'en' | 'zh') || 'en'
    throw new Error(data.error || translations[lang]['error.upload'])
  }
  return data.url as string
}
