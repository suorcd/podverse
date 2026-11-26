import { expect, test } from '@playwright/test';

import {
  E2E_BOOST_EPISODE_ITEM_ID_TEXT,
  E2E_MUSIC_TRACK_ONE_ID_TEXT,
  E2E_PODCAST_ITEM_CHAPTERED_ID_TEXT,
} from './helpers/seedConstants';
import { actionAndCapture, capturePageLoad } from './helpers/stepScreenshots';

test.describe('Catalog-restricted item search', () => {
  test('When the allowlist is set, searching a stored episode title lists a link to its episode page.', async ({
    page,
  }, testInfo) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search\/?$/);

    const searchField = page.getByLabel('Search by Title...');
    await expect(searchField).toBeVisible();
    await capturePageLoad(page, testInfo, 'Search is open with the title field.', searchField);

    const episodeLink = page.locator(`a[href="/episode/${E2E_PODCAST_ITEM_CHAPTERED_ID_TEXT}"]`);
    await actionAndCapture(
      page,
      testInfo,
      'Searching a stored episode title lists it as a link to its episode page.',
      async () => {
        await searchField.fill('E2E Podcast With Chapters');
        await expect(episodeLink).toBeVisible();
        await expect(page.getByText('Episodes', { exact: true })).toBeVisible();
        await expect(page.locator('a[href^="/podcast-index/feed/"]')).toHaveCount(0);
      },
      episodeLink
    );
  });

  test('When the allowlist is set and Music is on, searching a stored track title lists a link to its track page.', async ({
    page,
  }, testInfo) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search\/?$/);

    const searchField = page.getByLabel('Search by Title...');
    await expect(searchField).toBeVisible();
    await page.getByRole('button', { name: 'Music', exact: true }).click();

    const trackLink = page.locator(`a[href="/track/${E2E_MUSIC_TRACK_ONE_ID_TEXT}"]`);
    await actionAndCapture(
      page,
      testInfo,
      'Searching a stored track title on the Music facet lists it as a link to its track page.',
      async () => {
        await searchField.fill('E2E Music Track One');
        await expect(trackLink).toBeVisible();
        await expect(page.getByText('Tracks', { exact: true })).toBeVisible();
      },
      trackLink
    );
  });

  test('When the allowlist is set, a stored episode on an off-list show is still found.', async ({
    page,
  }, testInfo) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search\/?$/);

    const searchField = page.getByLabel('Search by Title...');
    await expect(searchField).toBeVisible();

    const episodeLink = page.locator(`a[href="/episode/${E2E_BOOST_EPISODE_ITEM_ID_TEXT}"]`);
    await actionAndCapture(
      page,
      testInfo,
      'A stored episode on an off-list show is listed because the allowlist gates adds, not reads.',
      async () => {
        await searchField.fill('E2E Boost Episode');
        await expect(episodeLink).toBeVisible();
      },
      episodeLink
    );
  });
});
