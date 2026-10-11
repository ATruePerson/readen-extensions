import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ContentRating, SourceIntents } from '@paperback/types'
import { Nhentai, NhentaiInfo, Sources } from './Nhentai.ts'

const gallery = {
  id: 123456,
  media_id: 'abcdef1',
  title: { english: 'Sample Gallery', japanese: '', pretty: 'Sample Gallery' },
  images: {
    pages: [
      { t: 'j', w: 800, h: 1200 },
      { t: 'w', w: 800, h: 1200 }
    ],
    cover: { t: 'j', w: 350, h: 500 },
    thumbnail: { t: 'w', w: 200, h: 283 }
  },
  tags: [
    { id: 1, type: 'language', name: 'english', url: '/tag/english/', count: 100 },
    { id: 2, type: 'artist', name: 'sample-artist', url: '/artist/x/', count: 5 }
  ],
  num_pages: 2,
  num_favorites: 42,
  upload_date: 1700000000
}

function okJson(payload: unknown, status = 200): any {
  return { status, data: JSON.stringify(payload), headers: {}, request: {} }
}

function makeSource(handler: (url: string) => unknown): Nhentai {
  const Pass = (o: any) => o;
  (globalThis as any).App = {
    createRequest: (o: any) => ({ cookies: [], headers: {}, ...o }),
    createRequestManager: () => ({
      schedule: async (req: any) => okJson(handler(req.url))
    }),
    createPagedResults: Pass,
    createPartialSourceManga: Pass,
    createSourceManga: Pass,
    createMangaInfo: Pass,
    createChapter: Pass,
    createChapterDetails: Pass,
    createTag: Pass,
    createTagSection: Pass
  }
  return new Nhentai({} as any)
}

describe('NhentaiInfo', () => {
  it('exposes Paperback-compatible metadata', () => {
    assert.equal(NhentaiInfo.name, 'nhentai.to')
    assert.equal(NhentaiInfo.icon, 'icon.png')
    assert.equal(NhentaiInfo.contentRating, ContentRating.ADULT)
    assert.ok((NhentaiInfo.intents ?? 0) & SourceIntents.MANGA_CHAPTERS)
    assert.equal(Sources.NhentaiInfo, NhentaiInfo)
  })
})

describe('Nhentai', () => {
  it('maps search results and next-page metadata', async () => {
    const src = makeSource(() => ({ result: [gallery], num_pages: 3, per_page: 25 }))
    const out: any = await src.getSearchResults({ title: 'sample' } as any, undefined)
    assert.equal(out.results.length, 1)
    assert.equal(out.results[0].mangaId, '123456')
    assert.equal(out.results[0].title, 'Sample Gallery')
    assert.equal(out.results[0].image, 'https://t.nhentai.net/galleries/abcdef1/cover.jpg')
    assert.deepEqual(out.metadata, { page: 2 })
  })

  it('ends pagination on the last page', async () => {
    const src = makeSource(() => ({ result: [gallery], num_pages: 1, per_page: 25 }))
    const out: any = await src.getSearchResults({ title: 'sample' } as any, { page: 1 })
    assert.equal(out.metadata, undefined)
  })

  it('builds manga details with grouped tags', async () => {
    const src = makeSource(() => gallery)
    const out: any = await src.getMangaDetails('123456')
    assert.equal(out.id, '123456')
    assert.ok(out.mangaInfo.titles.includes('Sample Gallery'))
    assert.equal(out.mangaInfo.status, 'Completed')
    assert.equal(out.mangaInfo.hentai, true)
    assert.equal(out.mangaInfo.tags.length, 2)
    assert.equal(out.mangaInfo.tags[0].id, 'language')
  })

  it('exposes one chapter per gallery', async () => {
    const src = makeSource(() => gallery)
    const chapters: any[] = await src.getChapters('123456')
    assert.equal(chapters.length, 1)
    assert.equal(chapters[0].id, '123456')
    assert.equal(chapters[0].chapNum, 1)
    assert.deepEqual(chapters[0].time, new Date(1700000000 * 1000))
  })

  it('builds page urls with per-page extensions', async () => {
    const src = makeSource(() => gallery)
    const out: any = await src.getChapterDetails('123456', '123456')
    assert.deepEqual(out.pages, [
      'https://i.nhentai.net/galleries/abcdef1/1.jpg',
      'https://i.nhentai.net/galleries/abcdef1/2.webp'
    ])
  })

  it('throws a bypass error on 403', async () => {
    const Pass = (o: any) => o;
    (globalThis as any).App.createRequestManager = () => ({
      schedule: async () => ({ status: 403, data: '', headers: {}, request: {} })
    })
    const src = new Nhentai({} as any)
    await assert.rejects(() => src.getSearchResults({ title: 'x' } as any, undefined), /Cloudflare Bypass Required/)
    void Pass
  })

  it('builds share urls', () => {
    const src = makeSource(() => gallery)
    assert.equal(src.getMangaShareUrl('123456'), 'https://nhentai.to/g/123456/')
  })
})
