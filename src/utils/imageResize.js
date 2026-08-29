// Center-crops to a square and downscales before upload — a phone photo can
// be several MB straight off the camera, and nothing here needs more than a
// couple hundred px for an avatar. No interactive crop UI; a simple center
// crop is a reasonable default for a profile photo.
export function resizeImageToSquare(file, size = 512, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const srcSize = Math.min(img.width, img.height)
      const srcX = (img.width - srcSize) / 2
      const srcY = (img.height - srcSize) / 2

      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size)

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (blob) resolve(blob)
        else reject(new Error('Could not process image'))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}
