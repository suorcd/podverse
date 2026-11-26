import { randomUUID } from 'node:crypto';

import type { Server } from 'http';
import request from 'supertest';
import type { EntityManager } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MediumEnum } from '@podverse/helpers';
import type { ORMContext } from '@podverse/orm';

import { getBaseApiUrl, startTestApp, stopTestApp } from './helpers/index.js';

vi.mock('@podverse/orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@podverse/orm')>();

  class MockCategoryService {
    async setCategoryCache(): Promise<void> {}
  }

  return {
    ...actual,
    CategoryService: MockCategoryService,
  };
});

vi.mock('../factories/podcastIndexService.js', () => ({
  podcastIndexService: {
    searchPodcasts: vi.fn(async () => {
      throw new Error('Podcast Index must not be called by title search');
    }),
    searchMusicByTerm: vi.fn(async () => {
      throw new Error('Podcast Index must not be called by title search');
    }),
  },
}));

type SeedChannelInput = {
  title: string;
  mediumId: MediumEnum;
  lastPubDate: string | null;
  publicVisible: boolean;
  withAbout: boolean;
};

type SeedItemInput = {
  channelId: number;
  title: string;
  pubDate: string | null;
  statusId?: number;
  live?: boolean;
};

type TitleSearchBody = {
  data?: { id_text: string; title?: string | null; channel?: { id_text: string } }[];
  meta?: { page: number; count: number; limit: number };
};

const token = `ttl${randomUUID().replaceAll('-', '').slice(0, 10)}`;

let podcastIndexSlot = 0;

function nextPodcastIndexId(): number {
  podcastIndexSlot += 1;
  const hex = randomUUID().replaceAll('-', '').slice(0, 6);
  const parsed = Number.parseInt(hex, 16) % 200_000_000;
  return 1_600_000_000 + parsed + podcastIndexSlot;
}

function httpsFeedUrl(): string {
  return `https://item-title-search-${randomUUID()}.example.com/feed.xml`;
}

function idTexts(body: TitleSearchBody): string[] {
  if (!Array.isArray(body.data)) {
    throw new Error('Title search response is missing data');
  }
  return body.data.map((row) => row.id_text);
}

describe('Stored item title search', () => {
  let app: import('express').Express | undefined;
  let server: Server | undefined;
  let ormContext: ORMContext | undefined;
  let config: (typeof import('@api/config/index.js'))['config'] | undefined;
  let searchUrl = '';
  const seededFeedIds: number[] = [];

  let startsNewer = '';
  let startsOlder = '';
  let startsVideo = '';
  let containsNewest = '';
  let containsNoDate = '';
  let music = '';
  let podcastChannelIdText = '';
  let avOrder: string[] = [];

  function requireManager(): EntityManager {
    if (!ormContext) {
      throw new Error('ORM context required');
    }
    return ormContext.dataSourceReadWrite.manager;
  }

  function requireApp(): import('express').Express {
    if (!app) {
      throw new Error('App required');
    }
    return app;
  }

  async function seedChannel(input: SeedChannelInput): Promise<{ id: number; idText: string }> {
    const manager = requireManager();
    const { Channel, Feed } = await import('@podverse/orm');
    const feedRepo = manager.getRepository(Feed);
    const feed = await feedRepo.save(
      feedRepo.create({
        url: httpsFeedUrl(),
        podcast_index_id: nextPodcastIndexId(),
      })
    );
    seededFeedIds.push(feed.id);
    const channelRepo = manager.getRepository(Channel);
    const channel = await channelRepo.save(
      channelRepo.create({
        feed_id: feed.id,
        medium_id: input.mediumId,
        title: input.title,
      })
    );
    await manager.query(
      `INSERT INTO feed_policy (feed_id, parse_allowed, public_visible, add_allowed)
       VALUES ($1, true, $2, true)`,
      [feed.id, input.publicVisible]
    );
    if (input.withAbout) {
      await manager.query(`INSERT INTO channel_about (channel_id, last_pub_date) VALUES ($1, $2)`, [
        channel.id,
        input.lastPubDate,
      ]);
    }
    return { id: channel.id, idText: channel.id_text };
  }

  async function seedItem(input: SeedItemInput): Promise<string> {
    const manager = requireManager();
    const orm = await import('@podverse/orm');
    const itemRepo = manager.getRepository(orm.Item);
    const item = await itemRepo.save(
      itemRepo.create({
        channel_id: input.channelId,
        guid: `item-title-search-${randomUUID()}`,
        pub_date: input.pubDate ? new Date(input.pubDate) : null,
        title: input.title,
        item_flag_status: { id: input.statusId ?? orm.ItemFlagStatusStatusEnum.Active },
      })
    );
    if (input.live) {
      await manager.query(
        `INSERT INTO live_item (item_id, live_item_status_id, start_time)
         VALUES ($1, $2, $3)`,
        [item.id, orm.LiveItemStatusEnum.Live, new Date('2026-01-01T00:00:00Z')]
      );
    }
    return item.id_text;
  }

  async function withAllowlist(
    run: () => Promise<void>,
    itemTitleSearchEnabled = true
  ): Promise<void> {
    if (!config) {
      throw new Error('Config required');
    }
    const active = config;
    const saved = active.catalog;
    // An id no seeded feed has, so matches are not limited to the allowlist.
    active.catalog = {
      ...saved,
      podcastIndexIdAllowlist: [nextPodcastIndexId()],
      itemTitleSearchEnabled,
    };
    try {
      await run();
    } finally {
      active.catalog = saved;
    }
  }

  async function withItemSearchEnabled(run: () => Promise<void>): Promise<void> {
    if (!config) {
      throw new Error('Config required');
    }
    const active = config;
    const saved = active.catalog;
    active.catalog = { ...saved, itemTitleSearchEnabled: true };
    try {
      await run();
    } finally {
      active.catalog = saved;
    }
  }

  beforeAll(async () => {
    const started = await startTestApp();
    app = started.app;
    server = started.server;
    ormContext = started.ormContext;
    if (!ormContext) {
      throw new Error('ORM context required for item title search integration test');
    }
    config = (await import('@api/config/index.js')).config;
    searchUrl = `${await getBaseApiUrl()}/item/search/title`;

    const podcast = await seedChannel({
      title: `${token} Podcast`,
      mediumId: MediumEnum.Podcast,
      lastPubDate: '2026-01-01',
      publicVisible: true,
      withAbout: true,
    });
    podcastChannelIdText = podcast.idText;
    const video = await seedChannel({
      title: `${token} Video`,
      mediumId: MediumEnum.Video,
      lastPubDate: '2026-01-01',
      publicVisible: true,
      withAbout: true,
    });
    const album = await seedChannel({
      title: `${token} Album`,
      mediumId: MediumEnum.Music,
      lastPubDate: '2026-01-01',
      publicVisible: true,
      withAbout: true,
    });
    const hidden = await seedChannel({
      title: `${token} Hidden`,
      mediumId: MediumEnum.Podcast,
      lastPubDate: '2026-01-01',
      publicVisible: false,
      withAbout: true,
    });
    const unparsed = await seedChannel({
      title: `${token} Unparsed`,
      mediumId: MediumEnum.Podcast,
      lastPubDate: null,
      publicVisible: true,
      withAbout: false,
    });

    startsNewer = await seedItem({
      channelId: podcast.id,
      title: `${token} Beta`,
      pubDate: '2025-01-01',
    });
    startsOlder = await seedItem({
      channelId: podcast.id,
      title: `${token} Alpha`,
      pubDate: '2024-01-01',
    });
    startsVideo = await seedItem({
      channelId: video.id,
      title: `${token} Gamma`,
      pubDate: '2023-01-01',
    });
    containsNewest = await seedItem({
      channelId: podcast.id,
      title: `The ${token} Show`,
      pubDate: '2026-01-01',
    });
    containsNoDate = await seedItem({
      channelId: podcast.id,
      title: `Old ${token} Hour`,
      pubDate: null,
    });
    music = await seedItem({
      channelId: album.id,
      title: `${token} Album Track`,
      pubDate: '2026-02-01',
    });

    const orm = await import('@podverse/orm');
    await seedItem({
      channelId: podcast.id,
      title: `${token} Inactive`,
      pubDate: '2026-03-01',
      statusId: orm.ItemFlagStatusStatusEnum.Archived,
    });
    await seedItem({
      channelId: podcast.id,
      title: `${token} Live`,
      pubDate: '2026-04-01',
      live: true,
    });
    await seedItem({
      channelId: hidden.id,
      title: `${token} Hidden Episode`,
      pubDate: '2026-05-01',
    });
    await seedItem({
      channelId: unparsed.id,
      title: `${token} Unparsed Episode`,
      pubDate: '2026-06-01',
    });

    avOrder = [startsNewer, startsOlder, startsVideo, containsNewest, containsNoDate];
  }, 120000);

  afterAll(async () => {
    if (ormContext && seededFeedIds.length > 0) {
      await ormContext.dataSourceReadWrite.query(`DELETE FROM feed WHERE id = ANY($1::int[])`, [
        seededFeedIds,
      ]);
    }
    await stopTestApp(server, ormContext);
  });

  it('Title search answers 404 while the allowlist is unset.', async () => {
    await withItemSearchEnabled(async () => {
      const withQuery = await request(requireApp()).get(searchUrl).query({ q: token, page: 1 });
      expect(withQuery.status).toBe(404);
      expect(withQuery.body).toEqual({ message: 'Not found' });

      const withoutQuery = await request(requireApp()).get(searchUrl);
      expect(withoutQuery.status).toBe(404);
      expect(withoutQuery.body).toEqual({ message: 'Not found' });
    });
  });

  it('Title search answers 404 while the flag is off, even with an allowlist set.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp()).get(searchUrl).query({ q: token, page: 1 });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ message: 'Not found' });
    }, false);
  });

  it('Titles that start with the term come before titles that contain it, newest publish date first.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp()).get(searchUrl).query({ q: token, page: 1 });
      expect(res.status).toBe(200);
      expect(idTexts(res.body)).toEqual(avOrder);
      expect(res.body.meta).toEqual({ page: 1, count: 5, limit: 60 });
      expect(res.body.data[0].channel.id_text).toBe(podcastChannelIdText);
    });
  });

  it('The match ignores letter case.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp())
        .get(searchUrl)
        .query({ q: token.toUpperCase(), page: 1 });
      expect(res.status).toBe(200);
      expect(idTexts(res.body)).toEqual(avOrder);
    });
  });

  it('The music medium lists only music items.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp())
        .get(searchUrl)
        .query({ q: token, medium: 'music', page: 1 });
      expect(res.status).toBe(200);
      expect(idTexts(res.body)).toEqual([music]);
      expect(res.body.meta.count).toBe(1);
    });
  });

  it('Inactive, live, hidden, and unparsed items are never returned.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp()).get(searchUrl).query({ q: token, page: 1 });
      expect(res.status).toBe(200);
      const titles = (res.body.data ?? []).map((row: { title?: string | null }) => row.title);
      expect(titles).not.toContain(`${token} Inactive`);
      expect(titles).not.toContain(`${token} Live`);
      expect(titles).not.toContain(`${token} Hidden Episode`);
      expect(titles).not.toContain(`${token} Unparsed Episode`);
      expect(res.body.meta.count).toBe(5);
    });
  });

  it('Percent and underscore in the term match only themselves.', async () => {
    await withAllowlist(async () => {
      const underscore = await request(requireApp())
        .get(searchUrl)
        .query({ q: `${token}_Alpha`, page: 1 });
      expect(underscore.status).toBe(200);
      expect(underscore.body.data).toEqual([]);
      expect(underscore.body.meta.count).toBe(0);

      const percent = await request(requireApp())
        .get(searchUrl)
        .query({ q: `${token}%Show`, page: 1 });
      expect(percent.status).toBe(200);
      expect(percent.body.data).toEqual([]);
      expect(percent.body.meta.count).toBe(0);
    });
  });

  it('Pages are cut in the query, so every match appears on exactly one page.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp()).get(searchUrl).query({ q: token, page: 2 });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.count).toBe(5);

      const orm = await import('@podverse/orm');
      const firstPage = await new orm.ItemService().searchByTitle({
        term: token,
        mediumType: 'av',
        offset: 2,
        limit: 2,
      });
      expect(firstPage.items.map((item) => item.id_text)).toEqual([
        startsVideo,
        containsNewest,
      ]);
      expect(firstPage.count).toBe(5);
    });
  });

  it('A blank term is a validation error while the allowlist is set.', async () => {
    await withAllowlist(async () => {
      const res = await request(requireApp()).get(searchUrl).query({ q: '   ', page: 1 });
      expect(res.status).toBe(400);
    });
  });
});
