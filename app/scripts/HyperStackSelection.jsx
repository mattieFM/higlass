/* eslint-disable */
import * as React from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { scaleLinear } from 'd3-scale';
import { pointer } from 'd3-selection';

import styles from './HyperStackSelection.module.css';

import { HyperstackSelectionContext } from './hocs/with-hyperstack-selection';
import HeatmapTiledPixiTrack from './HeatmapTiledPixiTrack';
import { StackedDataFetcher } from './data-fetchers';

/**
 * Temporarily keep this logic here until we can move it outside of this component.
 *
 * @param {any} renderer
 * @param {import('d3-zoom').D3ZoomEvent<HTMLElement, unknown> & { wheelDelta: number }} event
 */
function handleStackedTilesetNavigation(renderer, event) {
  const tracks = renderer.getTracksAtPosition(
    ...pointer(event, renderer.props.canvasElement),
  );
  /** @type {HeatmapTiledPixiTrack} */
  const track = tracks.at(0);
  /** @type {StackedDataFetcher} */
  const dataFetcher = track.dataFetcher;
  if (
    tracks.length === 1 &&
    track instanceof HeatmapTiledPixiTrack &&
    dataFetcher instanceof StackedDataFetcher
  ) {
    return track;
  }
  return null;
}

/** @typedef {Record<string, any>} TiledPlots */

/**
 * @param {import('pub-sub-es').PubSub} pubSub
 * @param {TiledPlots} tiledPlots
 */
function useHyperstackTrack(pubSub, tiledPlots) {
  const context = React.useContext(HyperstackSelectionContext);
  if (!context) {
    throw new Error('No HyperstackSelectionContext defined');
  }
  const [track, setTrack] = React.useState(null);
  React.useEffect(() => {
    const tokens = [
      pubSub.subscribe('app.altKeyDown', () => {
        if (Object.keys(tiledPlots).length !== 1) {
          // Only one tiled plot is supported
          return;
        }
        const { trackRenderer } = Object.values(tiledPlots)[0];
        if (Object.keys(trackRenderer.trackDefObjects).length !== 1) {
          // Only one track is supported
          return;
        }
        const { trackObject, trackDef } = Object.values(
          trackRenderer.trackDefObjects,
        )[0];
        if (
          trackObject instanceof HeatmapTiledPixiTrack &&
          trackObject.dataFetcher instanceof StackedDataFetcher
        ) {
          // Only combination supported for "hyperstack" navigation
          const data = {
            rerender() {
              trackObject.removeTiles(Object.keys(trackObject.fetchedTiles));
              trackObject.fetching.clear();
              trackObject.refreshTiles();
            },
            dataFetcher: trackObject.dataFetcher,
            stack: trackDef.track.data.children,
          };
          setTrack(data);
        }
        context.enabled = true;
      }),
      pubSub.subscribe('app.altKeyUp', () => {
        context.enabled = false;
        setTrack(null);
      }),
    ];
    return () => {
      tokens.forEach((token) => pubSub.unsubscribe(token));
    };
  }, []);
  return track;
}

/** @typedef {{ step: number, label: string }} TimePoint */

/**
 * @typedef Props
 * @property {Record<string, any>} tiledPlots
 * @property {import('pub-sub-es').PubSub} pubSub
 */

/** @param {Props} props */
export default function HyperStackSelection(props) {
  const track = useHyperstackTrack(props.pubSub, props.tiledPlots);
  /** @type {TimePoint[]} */
  // @ts-expect-error
  const stack = track?.stack ?? [];

  /** @type {React.Ref<HTMLDivElement>} */
  const ref = React.useRef(null);
  const [cursor, setCursor] = React.useState(0);

  const maxWidth = 250;
  const totalDistance = stack.reduce((acc, item) => acc + (item.step ?? 0), 0);
  const scale = scaleLinear().domain([0, totalDistance]).range([0, maxWidth]);

  React.useEffect(() => {
    if (track) {
      ref.current?.focus();
    } else {
      ref.current?.blur();
    }
  }, [track]);

  if (!track) {
    return null;
  }

  return (
    <div className={styles['hyperstack']}>
      <div className={styles['timeline-line']} />
      <ToggleGroup.Root
        type="single"
        className={styles['timeline-points']}
        ref={ref}
        value={stack[cursor]?.label}
      >
        {stack.map((item, idx) => (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <label className={styles['timepoint-label']}>{item.label}</label>
            <ToggleGroup.Item
              key={idx}
              value={item.label}
              className={styles['timepoint']}
              style={{ marginRight: scale(item.step ?? 0) }}
              onFocus={() => {
                setCursor(idx);
                track.dataFetcher.cursor = idx;
                track.rerender();
              }}
            >
              <svg
                width="35"
                height="35"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9.875 7.5C9.875 8.81168 8.81168 9.875 7.5 9.875C6.18832 9.875 5.125 8.81168 5.125 7.5C5.125 6.18832 6.18832 5.125 7.5 5.125C8.81168 5.125 9.875 6.18832 9.875 7.5Z"
                  fill="#333"
                />
              </svg>
            </ToggleGroup.Item>
          </div>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
