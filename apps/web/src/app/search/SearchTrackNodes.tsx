'use client';

import React from 'react';

import type { DTOItem } from '@podverse/helpers';
import { mergeDTOItemThenChannelImageCandidates } from '@podverse/helpers';
import { Divider } from '@podverse/ui';

import { CommonTrackRow } from '../../components/Common/Artist/Album/Track/CommonTrackRow';
import { IMAGES } from '../../constants/images';
import { getItemPathByMedium } from '../../utils/redirect/redirectToChannelPageByMedium';

import styles from '../../styles/components/Common/List/ListNodes.module.scss';

type SearchTrackNodesProps = {
  items: DTOItem[];
};

/** Search results link to the track page; the album track list keeps its play-on-click row. */
export const SearchTrackNodes: React.FC<SearchTrackNodesProps> = ({ items }) => {
  return (
    <div className={styles.listTracks}>
      {items.map((item, idx) => {
        const channel = item.channel;
        if (!channel) {
          return null;
        }
        const imageCandidates = mergeDTOItemThenChannelImageCandidates(
          item.item_images,
          channel.channel_images,
          IMAGES.LIST.TRACKS.DESKTOP.SIZE_FIND_TARGET,
          'lesser'
        );
        return (
          <React.Fragment key={item.id}>
            <CommonTrackRow
              href={getItemPathByMedium(channel.medium_id, item.id_text)}
              title={item.title ?? ''}
              subtitle={channel.title}
              imageUrl={imageCandidates[0] ?? null}
            />
            {idx < items.length - 1 ? <Divider /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};
