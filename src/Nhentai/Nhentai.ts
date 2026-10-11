import {
  BadgeColor,
  Chapter,
  ChapterDetails,
  ContentRating,
  PagedResults,
  Request,
  Response,
  SearchRequest,
  Source,
  SourceInfo,
  SourceIntents,
  SourceManga
} from '@paperback/types'
import { BASE_URL, parseDetailsPage, parsePages, parseSearchPage } from './Parser.ts'

export const NhentaiInfo: SourceInfo = {
  version: '0.2.1',
  name: 'nhentai.to',
  icon: 'icon.png',
  author: 'Readen',
  authorWebsite: 'https://github.com/Readen',
  description: 'nhentai.to source for Readen. Paperback 0.8 compatible.',
  contentRating: ContentRating.ADULT,
  websiteBaseURL: BASE_URL,
  sourceTags: [{ text: 'ADULT', type: BadgeColor.RED }],
  intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED
}

export class Nhentai extends Source {
  requestManager = App.createRequestManager({
    requestsPerSecond: 4,
    requestTimeout: 20000,
    interceptor: {
      interceptRequest: async (request: Request): Promise<Request> => {
        request.headers = {
          ...(request.headers ?? {}),
          Referer: `${BASE_URL}/`,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Readen/0.2'
        }
        return request
      },
      interceptResponse: async (response: Response): Promise<Response> => response
    }
  })

  private async getHtml(path: string): Promise<string> {
    const response = await this.requestManager.schedule(
      App.createRequest({ url: `${BASE_URL}${path}`, method: 'GET' }),
      1
    )
    if (response.status === 403 || response.status === 503) {
      throw new Error('Cloudflare Bypass Required')
    }
    if (response.status >= 400 || typeof response.data !== 'string') {
      throw new Error(`nhentai request failed (${response.status})`)
    }
    return response.data
  }

  private async getDetails(mangaId: string) {
    const $ = this.cheerio.load(await this.getHtml(`/g/${mangaId}/`))
    return parseDetailsPage($, mangaId)
  }

  override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
    const title = (query.title ?? '').trim()
    if (/^\d+$/.test(title)) {
      const details = await this.getDetails(title)
      return App.createPagedResults({
        results: [
          App.createPartialSourceManga({
            mangaId: details.id,
            title: details.title,
            image: details.cover,
            subtitle: undefined
          })
        ],
        metadata: undefined
      })
    }
    const page: number = metadata?.page ?? 1
    const html = await this.getHtml(
      `/search?q=${encodeURIComponent(title || '*')}&page=${page}`
    )
    const { tiles, hasNextPage } = parseSearchPage(this.cheerio.load(html))
    return App.createPagedResults({
      results: tiles.map(t =>
        App.createPartialSourceManga({
          mangaId: t.mangaId,
          title: t.title,
          image: t.image,
          subtitle: undefined
        })
      ),
      metadata: hasNextPage ? { page: page + 1 } : undefined
    })
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const d = await this.getDetails(mangaId)
    return App.createSourceManga({
      id: d.id,
      mangaInfo: App.createMangaInfo({
        image: d.cover,
        titles: [d.title, d.altTitle].filter((t): t is string => !!t),
        status: 'Completed',
        desc: d.pageCount > 0 ? `${d.pageCount} pages` : '',
        hentai: true,
        tags: d.tags.map(section =>
          App.createTagSection({
            id: section.id,
            label: section.label,
            tags: section.tags.map(t => App.createTag(t))
          })
        ),
        covers: d.cover ? [d.cover] : []
      })
    })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const d = await this.getDetails(mangaId)
    return [
      App.createChapter({
        id: d.id,
        chapNum: 1,
        name: d.title,
        time: d.uploadTime,
        sortingIndex: 0
      })
    ]
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const $ = this.cheerio.load(await this.getHtml(`/g/${chapterId}/`))
    return App.createChapterDetails({
      id: chapterId,
      mangaId: chapterId,
      pages: parsePages($)
    })
  }

  override getMangaShareUrl(mangaId: string): string {
    return `${BASE_URL}/g/${mangaId}/`
  }

  override async getCloudflareBypassRequestAsync(): Promise<Request> {
    return App.createRequest({ url: BASE_URL, method: 'GET' })
  }
}

// Required by the Paperback bundler: req['Sources']['NhentaiInfo'].
export const Sources = { NhentaiInfo }
