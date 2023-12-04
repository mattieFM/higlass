import QuickLRU from "quick-lru";
import DataFetcher, { isDividedTile } from "./DataFetcher";

/** @typedef {import('./DataFetcher').Tile} Tile */
/** @typedef {import('../types').DataConfig} DataConfig */
/** @typedef {import('../types').TilesetInfo} TilesetInfo */
/**
 * @template T
 * @typedef {import('../types').AbstractDataFetcher<T>} AbstractDataFetcher
 */

/**
 * @template T
 * @param {T} condition
 * @param {string=} message
 * @returns {asserts condition}
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed.${message ? ` ${message}.` : ''}`);
  }
}

/** @param {TilesetInfo[]} infos */
function assertTilesetsAreStackable(infos) {
  const [first, ...rest] = infos;
  assert('resolutions' in first, "tileset missing resolutions");
  for (const info of rest) {
    assert('resolutions' in info, "tileset missing resolutions");
    assert(first.coordSystem === info.coordSystem, "tileset coordSystem mismatch");
    first.resolutions.forEach((resolution, index) => {
      assert(resolution === info.resolutions[index], "tileset resolution mismatch");
    });
    first.max_pos.forEach((maxPos, index) => {
      assert(maxPos === info.max_pos[index], "tileset max_pos mismatch");
    });
    first.min_pos.forEach((minPos, index) => {
      assert(minPos === info.min_pos[index], "tileset min_pos mismatch");
    });
  }
}

/**
 * @param {DataFetcher} dataFetcher
 * @param {{ maxSize?: number }} options
 * @returns {AbstractDataFetcher<Tile> & { clearCache: () => void, name?: string }}
 */
function cache(dataFetcher, { maxSize = 20 } = {}) {
  /** @type {TilesetInfo | undefined} */
  let tsInfo;

  /** @type {Map<string, Tile>} */
  const tileCache = new QuickLRU({ maxSize });

  return {
    get name() {
      // @ts-expect-error - We know the dataConfig is set
      return dataFetcher.dataConfig.name;
    },
    async tilesetInfo(callback) {
      if (tsInfo) {
        callback?.(tsInfo);
        return tsInfo;
      }
      return dataFetcher.tilesetInfo((info) => {
        assert(info !== null, "tilesetInfo is null");
        if ("error" in info) {
          callback?.(info);
          throw info;
        }
        tsInfo = info;
        callback?.(info);
        return info;
      });
    },
    async fetchTilesDebounced(receivedTiles, tileIds) {
      const neededTileIds = tileIds.filter((tileId) => !tileCache.has(tileId));
      if (neededTileIds.length > 0) {
        const tiles = await dataFetcher.fetchTilesDebounced(() => {}, neededTileIds);
        for (const [tileId, tile] of Object.entries(tiles)) {
          assert(!isDividedTile(tile), "Found divided tile");
          tileCache.set(tileId, tile);
        }
      }
      /** @type {Record<string, Tile>} */
      const tiles = {};
      for (const tileId of tileIds) {
        // @ts-expect-error - We know the tile is in the cache
        tiles[tileId] = tileCache.get(tileId);
      }
      receivedTiles(tiles);
      return tiles;
    },
    clearCache() {
      tsInfo = undefined;
      tileCache.clear();
    }
  }
}

/**
 * @param {{ name?: string }[]} fetchers
 */
function formatNames(fetchers) {
  const series = fetchers.map(fetcher => fetcher.name ?? 'unnamed').join(', ');
  let name = fetchers.length > 1 ? `stack(${series})` : series;
  name = name.length > 100 ? `${name.slice(0, 100)}...` : name;
  return name;
}

/** @implements {AbstractDataFetcher<Tile>} */
export default class StackedDataFetcher {
  /** @type {ReturnType<typeof cache>[]} */
  #fetchers;

  /**
   * Index of the current fetcher.
   * @type {number}
   */
  #cursor = 0;

  /** @type {boolean} */
  tilesetInfoLoading = true;

  /** @type {{}} */
  dataConfig = {};

  /**
   * @param {import('../types').DataConfig} dataConfig
   * @param {import('pub-sub-es').PubSub} pubSub
   */
  constructor({ type, children }, pubSub) {
    assert(type === "stacked");
    assert(Array.isArray(children));
    this.#fetchers = children.map((c) => cache(new DataFetcher(c, pubSub)));
  }

  get #currentFetcher() {
    return this.#fetchers[this.#cursor];
  }

  // increment the cursor and return the next fetcher, wrapping around
  next() {
    this.#cursor = (this.#cursor + 1) % this.#fetchers.length;
  }

  // increment the cursor and return the next fetcher, wrapping around
  prev() {
    this.#cursor = (this.#cursor - 1 + this.#fetchers.length) % this.#fetchers.length;
  }

  /** @param {import('../types').HandleTilesetInfoFinished} callback */
  async tilesetInfo(callback) {
    const infos = await Promise.all(
      this.#fetchers.map(fetcher => new Promise(resolve => {
        fetcher.tilesetInfo(resolve);
      }))
    );
    assertTilesetsAreStackable(infos);
    this.tilesetInfoLoading = false;
    // TODO: Smarter way to combine tileset infos? Cache?
    const combinedTilesetInfo = { ...infos[0], name: formatNames(this.#fetchers) };
    callback(combinedTilesetInfo);
    return combinedTilesetInfo;
  }

  /**
   * @param {(tiles: Record<string, Tile>) => void} receivedTiles
   * @param {string[]} tileIds
   * @returns {Promise<Record<string, Tile>>}
   */
  async fetchTilesDebounced(receivedTiles, tileIds) {
    return this.#currentFetcher.fetchTilesDebounced(receivedTiles, tileIds);
  }

}
