// Pure nhentai API parsing. No App dependencies — safe to unit test.
//
// ASSUMPTION: nhentai.to mirrors the documented public nhentai gallery/search
// JSON shape (server-side probing is blocked by bot protection; the iOS/macOS
// JS runtime will verify on-device). Endpoints:
//   GET {base}/api/galleries/search?query=&page=
//   GET {base}/api/gallery/{id}
// Images: https://i.nhentai.net/galleries/{media_id}/{n}.{ext}
// Covers: https://t.nhentai.net/galleries/{media_id}/cover.{ext}
// ext from page type: j=jpg, p=png, g=gif, w=webp.

export const BASE_URL = 'https://nhentai.to'

export interface NhImage {
  t: string
  w: number
  h: number
}

export interface NhTag {
  id: number
  type: string
  name: string
  url: string
  count: number
}

export interface NhGallery {
  id: number
  media_id: string
  title: { english?: string; japanese?: string; pretty?: string }
  images: { pages: NhImage[]; cover: NhImage; thumbnail: NhImage }
  tags: NhTag[]
  num_pages: number
  num_favorites: number
  upload_date: number
}

export interface NhSearch {
  result: NhGallery[]
  num_pages: number
  per_page: number
}

export interface PlainTag {
  id: string
  label: string
}

export interface PlainTagSection {
  id: string
  label: string
  tags: PlainTag[]
}

const IMAGE_EXT: Record<string, string> = { j: 'jpg', p: 'png', g: 'gif', w: 'webp' }

export function extOf(t: string): string {
  return IMAGE_EXT[t] ?? 'jpg'
}

export function pageUrl(mediaId: string, index: number, t: string): string {
  return `https://i.nhentai.net/galleries/${mediaId}/${index + 1}.${extOf(t)}`
}

export function coverUrl(mediaId: string, t: string): string {
  return `https://t.nhentai.net/galleries/${mediaId}/cover.${extOf(t)}`
}

export function galleryTitle(g: NhGallery): string {
  return g.title.pretty || g.title.english || g.title.japanese || `#${g.id}`
}

export function tagGroups(g: NhGallery): PlainTagSection[] {
  const groups = new Map<string, PlainTag[]>()
  for (const tag of g.tags ?? []) {
    const list = groups.get(tag.type) ?? []
    list.push({ id: String(tag.id), label: tag.name })
    groups.set(tag.type, list)
  }
  return [...groups.entries()].map(([type, tags]) => ({
    id: type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    tags
  }))
}
