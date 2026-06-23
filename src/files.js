// ============================================================================
// FILE HANDLING (free, no Cloud Storage). Files are stored as base64 data URLs
// inside Firestore, so each file must fit under Firestore's ~1 MB document
// limit. Images are compressed/resized client-side to fit; other files (PDFs
// etc.) are rejected if too big, with a friendly message.
// ============================================================================

// Firestore doc cap is 1,048,576 bytes. Leave headroom for other fields and the
// base64 (~33%) overhead, so cap the encoded size of a single file.
const MAX_DATAURL_BYTES = 1_000_000
// Friendly limit shown to users (original file size for non-images).
export const MAX_FILE_BYTES = 900 * 1024

export function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  // 4 base64 chars => 3 bytes, minus padding.
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image.'))
    img.src = src
  })
}

function drawToDataURL(img, w, h, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}

// Compress an image to fit under MAX_DATAURL_BYTES by lowering quality, then
// downscaling if needed.
async function compressImage(file) {
  const srcUrl = await readFileAsDataURL(file)
  const img = await loadImage(srcUrl)
  let w = img.width
  let h = img.height
  let maxDim = 1600
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, maxDim / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))
    let quality = 0.85
    let dataUrl = drawToDataURL(img, tw, th, quality)
    while (dataUrlBytes(dataUrl) > MAX_DATAURL_BYTES && quality > 0.4) {
      quality -= 0.12
      dataUrl = drawToDataURL(img, tw, th, quality)
    }
    if (dataUrlBytes(dataUrl) <= MAX_DATAURL_BYTES) return dataUrl
    maxDim = Math.round(maxDim * 0.8) // shrink and retry
  }
  throw new Error('This image is too large to store on the free plan.')
}

// Small preview (used in the list/cards) so we don't load full bytes there.
async function makeThumb(dataUrl, maxDim = 240) {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  return drawToDataURL(
    img,
    Math.max(1, Math.round(img.width * scale)),
    Math.max(1, Math.round(img.height * scale)),
    0.6
  )
}

/**
 * Turn a picked File into a storable attachment.
 * @returns {Promise<{name,type,size,dataUrl,thumb}>}
 * @throws {Error} with a friendly message if the file can't fit on the free plan.
 */
export async function prepareFile(file) {
  const isImage = (file.type || '').startsWith('image/')
  if (isImage) {
    let dataUrl
    try {
      dataUrl = await compressImage(file)
    } catch {
      // Some formats (e.g. HEIC) may not decode in-browser; fall back to raw.
      dataUrl = await readFileAsDataURL(file)
      if (dataUrlBytes(dataUrl) > MAX_DATAURL_BYTES) {
        throw new Error(
          `"${file.name}" couldn't be compressed under the 1 MB free-plan limit. Try a JPG/PNG screenshot.`
        )
      }
    }
    let thumb = null
    try {
      thumb = await makeThumb(dataUrl)
    } catch {
      thumb = null
    }
    return {
      name: file.name || 'image.jpg',
      type: 'image/jpeg',
      size: dataUrlBytes(dataUrl),
      dataUrl,
      thumb,
    }
  }

  // Non-image (PDF, etc.) — no compression possible.
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `"${file.name}" is ${humanSize(file.size)} — over the 1 MB limit on the free plan. Upgrade to Blaze for larger files.`
    )
  }
  const dataUrl = await readFileAsDataURL(file)
  if (dataUrlBytes(dataUrl) > MAX_DATAURL_BYTES) {
    throw new Error(`"${file.name}" is just over the 1 MB free-plan limit.`)
  }
  return {
    name: file.name || 'file',
    type: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl,
    thumb: null,
  }
}

// Open an attachment's bytes (a data URL) for viewing/downloading. Converts to
// a Blob URL and opens it in a new tab (PDFs render inline; images show).
export function openDataUrl(dataUrl, name) {
  try {
    const [meta, b64] = dataUrl.split(',')
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    // Fallback to download if popup blocked.
    if (!w) {
      const a = document.createElement('a')
      a.href = url
      a.download = name || 'file'
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    // Last resort: navigate to the data URL directly.
    window.open(dataUrl, '_blank')
  }
}
