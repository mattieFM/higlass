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
  * @param {Record<string, Tile | import('./DataFetcher').DividedTile>} tiles
  * @returns {asserts tiles is Record<string, Tile>}
  */
function assertNoDividedTiles(tiles) {
  for (const tile of Object.values(tiles)) {
    assert(!isDividedTile(tile), "Found divided tile");
  }
}

/** @implements {AbstractDataFetcher<Tile>} */
export default class StackedDataFetcher {
  /** @type {DataFetcher[]} */
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
    this.#fetchers = children.map((c) => new DataFetcher(c, pubSub));
  }

  get #currentFetcher() {
    return this.#fetchers[this.#cursor];
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
    // TODO:
    //   - Smarter way to combine tileset infos?
    //   - Cache?
    const combinedTilesetInfo = { ...infos[0], name: "Stacked Tileset" };
    callback(combinedTilesetInfo);
    return combinedTilesetInfo;
  }

  /**
   * @param {(tiles: Record<string, Tile>) => void} receivedTiles
   * @param {string[]} tileIds
   * @returns {Promise<Record<string, Tile>>}
   */
  async fetchTilesDebounced(receivedTiles, tileIds) {
    const tiles = await this.#currentFetcher.fetchTilesDebounced(() => {}, tileIds);
    assertNoDividedTiles(tiles);
    receivedTiles(tiles);
    return tiles;
  }

}
