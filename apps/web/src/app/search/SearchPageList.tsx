'use client';

import { useTranslations } from 'next-intl';
import React from 'react';

import { CommonPodcastListNodes } from '../../components/Common/Podcast/CommonPodcastNodes';
import { CommonEpisodeListNodes } from '../../components/Common/Podcast/Episode/CommonEpisodeNodes';
import { ListSearchResultsPodcastIndexFeeds } from '../../components/List/SearchResults/ListSearchResultsPodcastIndexFeeds';
import { WebLoadingSpinnerOverlay } from '../../components/LoadingSpinner/WebLoadingSpinnerOverlay';
import { NoResults } from '../../components/NoResults/NoResults';
import { Pagination } from '../../components/Pagination/Pagination';
import { getChannelPath } from '../../utils/redirect/redirectToChannelPageByMedium';
import { scrollMainToTop } from '../../utils/scroll';
import { podcastListItemFromChannel } from '../../utils/subscribed/channelListItems';
import { useSearchPageContext } from './SearchPageContext';
import { SearchTrackNodes } from './SearchTrackNodes';

import listStyles from '../../styles/components/Common/List/Podcasts/ListPodcasts.module.scss';
import styles from './SearchPageList.module.scss';

export const SearchPageList: React.FC = () => {
  const tFeatures = useTranslations('features');
  const {
    catalogChannels,
    catalogPage,
    catalogTotalPages,
    catalogItems,
    catalogItemPage,
    catalogItemTotalPages,
    isCatalogSearch,
    isLoading,
    isItemLoading,
    searchParams,
    searchResultFeeds,
    setCatalogPage,
    setCatalogItemPage,
  } = useSearchPageContext();
  const isMusic = searchParams.medium === 'music';
  const resultCount = isCatalogSearch
    ? catalogChannels.length + catalogItems.length
    : searchResultFeeds.length;
  const isLoadingAny = isLoading || isItemLoading;
  const showEmpty = !isLoadingAny && searchParams.q.trim() !== '' && resultCount === 0;

  const handleCatalogPage = (page: number) => {
    setCatalogPage(page);
    scrollMainToTop();
  };

  const handleCatalogItemPage = (page: number) => {
    setCatalogItemPage(page);
    scrollMainToTop();
  };

  let results: React.ReactNode;
  if (showEmpty) {
    results = <NoResults role="status" />;
  } else if (!isCatalogSearch) {
    results = (
      <ListSearchResultsPodcastIndexFeeds searchResultPodcastIndexFeeds={searchResultFeeds} />
    );
  } else {
    results = (
      <>
        {catalogChannels.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {isMusic ? tFeatures('search.albums') : tFeatures('search.shows')}
            </h2>
            <Pagination
              currentPage={catalogPage}
              totalPages={catalogTotalPages}
              setPage={handleCatalogPage}
              paginationControlsClassName={listStyles.paginationControls}
            >
              <CommonPodcastListNodes
                items={catalogChannels.map((channel) => ({
                  ...podcastListItemFromChannel(channel, null),
                  href: getChannelPath(channel),
                }))}
                viewSelected="rows"
              />
            </Pagination>
          </section>
        ) : null}
        {catalogItems.length > 0 ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {isMusic ? tFeatures('search.tracks') : tFeatures('search.episodes')}
            </h2>
            <Pagination
              currentPage={catalogItemPage}
              totalPages={catalogItemTotalPages}
              setPage={handleCatalogItemPage}
              paginationControlsClassName={listStyles.paginationControls}
            >
              {isMusic ? (
                <SearchTrackNodes items={catalogItems} />
              ) : (
                <CommonEpisodeListNodes
                  channel={null}
                  items={catalogItems}
                  viewSelected="rows"
                  showChannelInfo
                />
              )}
            </Pagination>
          </section>
        ) : null}
      </>
    );
  }

  return (
    <>
      {results}
      <WebLoadingSpinnerOverlay isLoading={isLoadingAny} />
    </>
  );
};
