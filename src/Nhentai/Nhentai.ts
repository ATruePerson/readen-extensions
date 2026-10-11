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
import {
  BASE_URL,
  NhGallery,
  NhSearch,
  coverUrl,
  galleryTitle,
  pageUrl,
  tagGroups
} from './Parser.ts'

export const NhentaiInfo: SourceInfo = {
  version: '0.1.0',
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
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Readen/0.1'
        }
        return request
      },
      interceptResponse: async (response: Response): Promise<Response> => response
    }
  })

  private async getJson<T>(path: string): Promise<T> {
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
    return JSON.parse(response.data) as T
  }

  override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
    const page: number = metadata?.page ?? 1
    const data = await this.getJson<NhSearch>(
      `/api/galleries/search?query=${encodeURIComponent(query.title ?? '')}&page=${page}`
    )
    const tiles = (data.result ?? []).map(g =>
      App.createPartialSourceManga({
        mangaId: String(g.id),
        title: galleryTitle(g),
        image: coverUrl(g.media_id, g.images.cover.t),
        subtitle: undefined
      })
    )
    return App.createPagedResults({
      results: tiles,
      metadata: page < data.num_pages ? { page: page + 1 } : undefined
    })
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const g = await this.getJson<NhGallery>(`/api/gallery/${mangaId}`)
    return App.createSourceManga({
      id: String(g.id),
      mangaInfo: App.createMangaInfo({
        image: coverUrl(g.media_id, g.images.cover.t),
        titles: [g.title.pretty, g.title.english, g.title.japanese].filter(
          (t): t is string => !!t
        ),
        status: 'Completed',
        desc: `${g.num_pages} pages`,
        hentai: true,
        tags: tagGroups(g).map(section =>
          App.createTagSection({
            id: section.id,
            label: section.label,
            tags: section.tags.map(t => App.createTag(t))
          })
        ),
        covers: [coverUrl(g.media_id, g.images.cover.t)]
      })
    })
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const g = await this.getJson<NhGallery>(`/api/gallery/${mangaId}`)
    return [
      App.createChapter({
        id: String(g.id),
        chapNum: 1,
        name: galleryTitle(g),
        time: new Date(g.upload_date * 1000),
        sortingIndex: 0
      })
    ]
  }

  async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
    const g = await this.getJson<NhGallery>(`/api/gallery/${chapterId}`)
    return App.createChapterDetails({
      id: String(g.id),
      mangaId: String(g.id),
      pages: g.images.pages.map((p, i) => pageUrl(g.media_id, i, p.t))
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
