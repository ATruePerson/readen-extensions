import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import { ContentRating, SourceIntents } from '@paperback/types'
import { Nhentai, NhentaiInfo, Sources } from './Nhentai.ts'

const searchHtml = `
<div class="gallery">
  <a class="cover" href="/g/111/"><img data-src="//t3.nhentai.to/galleries/aaa/cover.jpg" /><div class="caption">Sample One</div></a>
  <a class="cover" href="/g/222/"><img src="https://t7.nhentai.to/galleries/bbb/cover.png" /><div class="caption">Sample Two</div></a>
  <a rel="sponsored" href="https://ads.example.com/"><img src="https://ads.example.com/a.jpg" /><div class="caption">Ad</div></a>
</div>
<a class="next" href="/search?q=x&page=2">Next</a>`

const lastPageHtml = `
<div class="gallery">
  <a class="cover" href="/g/111/"><img data-src="//t3.nhentai.to/galleries/aaa/cover.jpg" /><div class="caption">Sample One</div></a>
</div>`

const detailsHtml = `
<div id="bigcontainer">
  <div id="info-block">
    <div id="info"><h1>Sample Gallery</h1><h2>Sample Alt</h2></div>
    <div class="tag-container field-name">Artists<span class="tags"><a href="/artist/sample-artist/"><span class="name">sample-artist</span></a></span></div>
    <div class="tag-container field-name">Languages<span class="tags"><a href="/language/english/"><span class="name">english</span></a></span></div>
    <div class="tag-container field-name">Pages<span class="tags"><span class="name">24</span></span></div>
    <div class="tags"><time datetime="2023-05-06T12:00:00Z">May 2023</time></div>
  </div>
  <div id="cover"><a href="/g/111/1/"><img data-src="//t3.nhentai.to/galleries/aaa/cover.jpg" /></a></div>
</div>
<script>window._gallery = $.parseJSON('{"1":"j,800,1200","2":"w,800,1200"}');</script>
<input id="gallery_id" value="111" />
<input id="load_id" value="789" />
<input id="load_dir" value="1011" />
<input id="load_server" value="2" />
<div id="thumbnail-container">
  <a class="thumb-container" href="/g/111/1/"><img data-src="https://t3.nhentai.to/galleries/aaa/1t.jpg" /></a>
  <a class="thumb-container" href="/g/111/2/"><img data-src="https://t3.nhentai.to/galleries/aaa/2t.jpg" /></a>
</div>`

const thumbsOnlyHtml = `
<div id="bigcontainer">
  <div id="info-block"><div id="info"><h1>Thumbs Only</h1></div></div>
  <div id="cover"><a href="/g/333/1/"><img data-src="//t3.nhentai.to/galleries/ccc/cover.jpg" /></a></div>
</div>
<div id="thumbnail-container">
  <a class="thumb-container" href="/g/333/1/"><img data-src="https://t3.nhentai.to/galleries/ccc/1t.jpg" /></a>
  <a class="thumb-container" href="/g/333/2/"><img data-src="https://t3.nhentai.to/galleries/ccc/2t.png" /></a>
</div>`

function okHtml(html: string, status = 200): any {
  return { status, data: html, headers: {}, request: {} }
}

function makeSource(handler: (url: string) => unknown): Nhentai {
  const Pass = (o: any) => o;
  (globalThis as any).App = {
    createRequest: (o: any) => ({ cookies: [], headers: {}, ...o }),
    createRequestManager: () => ({
      schedule: async (req: any) => okHtml(handler(req.url))
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
  return new Nhentai(cheerio as any)
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
  it('maps search cards, skips ads, follows pagination', async () => {
    const seen: string[] = []
    const src = makeSource(url => {
      seen.push(url)
      return searchHtml
    })
    const out: any = await src.getSearchResults({ title: 'sample' } as any, undefined)
    assert.equal(out.results.length, 2)
    assert.equal(out.results[0].mangaId, '111')
    assert.equal(out.results[0].title, 'Sample One')
    assert.equal(out.results[0].image, 'https://t3.nhentai.to/galleries/aaa/cover.jpg')
    assert.equal(out.results[1].image, 'https://t7.nhentai.to/galleries/bbb/cover.png')
    assert.deepEqual(out.metadata, { page: 2 })
    assert.ok(seen[0].includes('/search?q=sample&page=1'))
  })

  it('ends pagination on the last page', async () => {
    const src = makeSource(() => lastPageHtml)
    const out: any = await src.getSearchResults({ title: 'sample' } as any, { page: 5 })
    assert.equal(out.results.length, 1)
    assert.equal(out.metadata, undefined)
  })

  it('resolves numeric queries as gallery ids', async () => {
    const src = makeSource(() => detailsHtml)
    const out: any = await src.getSearchResults({ title: '111' } as any, undefined)
    assert.equal(out.results.length, 1)
    assert.equal(out.results[0].mangaId, '111')
    assert.equal(out.results[0].title, 'Sample Gallery')
  })

  it('builds details with grouped tags', async () => {
    const src = makeSource(() => detailsHtml)
    const out: any = await src.getMangaDetails('111')
    assert.equal(out.id, '111')
    assert.ok(out.mangaInfo.titles.includes('Sample Gallery'))
    assert.equal(out.mangaInfo.status, 'Completed')
    assert.equal(out.mangaInfo.hentai, true)
    assert.equal(out.mangaInfo.desc, '24 pages')
    assert.equal(out.mangaInfo.image, 'https://t3.nhentai.to/galleries/aaa/cover.jpg')
    const artists = out.mangaInfo.tags.find((s: any) => s.id === 'artists')
    assert.equal(artists.tags[0].label, 'sample-artist')
  })

  it('exposes one chapter per gallery', async () => {
    const src = makeSource(() => detailsHtml)
    const chapters: any[] = await src.getChapters('111')
    assert.equal(chapters.length, 1)
    assert.equal(chapters[0].id, '111')
    assert.equal(chapters[0].chapNum, 1)
    assert.deepEqual(chapters[0].time, new Date('2023-05-06T12:00:00Z'))
  })

  it('builds page urls from the embedded payload', async () => {
    const src = makeSource(() => detailsHtml)
    const out: any = await src.getChapterDetails('111', '111')
    assert.deepEqual(out.pages, [
      'https://i2.nhentai.to/1011/789/1.jpg',
      'https://i2.nhentai.to/1011/789/2.webp'
    ])
  })

  it('falls back to thumbnails when no payload exists', async () => {
    const src = makeSource(() => thumbsOnlyHtml)
    const out: any = await src.getChapterDetails('333', '333')
    assert.deepEqual(out.pages, [
      'https://t3.nhentai.to/galleries/ccc/1.jpg',
      'https://t3.nhentai.to/galleries/ccc/2.png'
    ])
  })

  it('throws a bypass error on 403', async () => {
    (globalThis as any).App.createRequestManager = () => ({
      schedule: async () => ({ status: 403, data: '', headers: {}, request: {} })
    })
    const src = new Nhentai(cheerio as any)
    await assert.rejects(
      () => src.getSearchResults({ title: 'x' } as any, undefined),
      /Cloudflare Bypass Required/
    )
  })
})
