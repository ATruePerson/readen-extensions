// HTML parsing for nhentai.to. No App dependencies — safe to unit test.
//
// ASSUMPTION: page shapes mirror nhentai.net's markup, as implemented by the
// Tachiyomi nhentai.to extension (GalleryAdults theme): search cards under
// `.gallery`, gallery pages under `#bigcontainer` with `#info-block` fields,
// page images from an embedded `$.parseJSON('{n:"t,w,h"}')` payload plus
// hidden inputs (gallery_id / load_id / load_dir / load_server).
// Server-side probing is blocked by bot protection; on-device verification
// is still pending.

import type { Cheerio, CheerioAPI, Element } from 'cheerio'

export const BASE_URL = 'https://nhentai.to'

export interface Tile {
  mangaId: string
  title: string
  image: string
}

export interface SearchPage {
  tiles: Tile[]
  hasNextPage: boolean
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

export interface Details {
  id: string
  title: string
  altTitle?: string
  cover: string
  tags: PlainTagSection[]
  pageCount: number
  uploadTime?: Date
}

const IMAGE_EXT: Record<string, string> = { j: 'jpg', p: 'png', g: 'gif', w: 'webp', b: 'bmp' }

const INFO_FIELDS = ['Parodies', 'Characters', 'Tags', 'Artists', 'Groups', 'Languages', 'Categories']

export function absUrl(url: string | undefined): string {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (/^https?:\/\//.test(url)) return url
  return new URL(url, BASE_URL).href
}

function imgSrc(el: Cheerio<Element>): string {
  return absUrl(el.attr('data-src') || el.attr('src'))
}

export function thumbnailToFull(url: string): string {
  return url.replace(/t(\.[a-zA-Z0-9]+)(\?.*)?$/, '$1$2')
}

export function parseSearchPage($: CheerioAPI): SearchPage {
  const tiles: Tile[] = []
  $('.gallery a').each((_, a) => {
    const anchor = $(a)
    const href = anchor.attr('href') ?? ''
    const id = href.split('/').filter(Boolean).pop() ?? ''
    if (!/\/g\/\d+\/?$/.test(href) || !id) return
    const title = anchor.find('.caption').first().text().trim()
    if (!title) return
    tiles.push({ mangaId: id, title, image: imgSrc(anchor.find('img').first()) })
  })
  return { tiles, hasNextPage: $('a.next').length > 0 }
}

function parseInfoTags($: CheerioAPI): PlainTagSection[] {
  const sections: PlainTagSection[] = []
  for (const field of INFO_FIELDS) {
    const container = $(`#info-block .field-name:contains("${field}")`).first()
    if (container.length === 0) continue
    const tags: PlainTag[] = []
    container.find('.tags a').each((_, a) => {
      const link = $(a)
      const label = link.find('.name').first().text().trim() || link.text().trim()
      if (!label) return
      const slug = (link.attr('href') ?? '').split('/').filter(Boolean).pop() ?? ''
      tags.push({ id: slug || label, label })
    })
    if (tags.length > 0) sections.push({ id: field.toLowerCase(), label: field, tags })
  }
  return sections
}

export function parseDetailsPage($: CheerioAPI, mangaId: string): Details {
  const title = $('#info h1').first().text().trim() || $('h1').first().text().trim()
  const altTitle = $('#info h2').first().text().trim() || undefined
  const cover = imgSrc($('#cover img').first()) || imgSrc($('#thumbnail-container img').first())
  const pagesText = $('#info-block .field-name:contains("Pages") .tags .name')
    .first()
    .text()
    .trim()
  const datetime =
    $('#info-block .tags time').first().attr('datetime') || $('time').first().attr('datetime')
  return {
    id: mangaId,
    title,
    altTitle,
    cover,
    tags: parseInfoTags($),
    pageCount: parseInt(pagesText, 10) || 0,
    uploadTime: datetime ? new Date(datetime) : undefined
  }
}

export function parsePages($: CheerioAPI): string[] {
  const script = $('script:contains("parseJSON")').first().html() ?? ''
  const match = script.match(/\$\.parseJSON\('(\{.*?\})'\)/s)
  const server = $('input#load_server').attr('value') ?? ''
  const loadDir = $('input#load_dir').attr('value') ?? ''
  const loadId = $('input#load_id').attr('value') ?? ''
  if (match && server && loadDir && loadId) {
    const images = JSON.parse(match[1]) as Record<string, string>
    return Object.keys(images)
      .sort((a, b) => Number(a) - Number(b))
      .map(n => {
        const ext = IMAGE_EXT[images[n].split(',')[0]] ?? 'jpg'
        return `https://i${server}.nhentai.to/${loadDir}/${loadId}/${n}.${ext}`
      })
  }
  const thumbs: string[] = []
  $('#thumbnail-container .thumb-container img').each((_, img) => {
    const full = thumbnailToFull(imgSrc($(img)))
    if (full) thumbs.push(full)
  })
  return thumbs
}
