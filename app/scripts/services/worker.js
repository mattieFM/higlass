// @ts-check
import { scaleLog, scaleLinear } from 'd3-scale';
import {
  DenseDataExtrema1D,
  DenseDataExtrema2D,
  getAggregationFunction,
  selectedItemsToSize,
} from '../utils';

/**
 * This function helps to fill in pixData by calling setPixData()
 * when selectedRowsOptions have been passed to workerSetPix().
 *
 * @param {ArrayLike<number>} data - The (2D) tile data array.
 * @param {[numRows: number, numCols: number]} shape - Array shape (number of rows and columns).
 * @param {(pixDataIndex: number, dataPoint: number) => void} setPixData - The setPixData function created by workerSetPix().
 * @param {number[] | number[][]} selectedRows - Row indices, for ordering and filtering rows. Used by the HorizontalMultivecTrack.
 * @param {'mean' | 'sum' | 'variance' | 'deviation'} selectedRowsAggregationMode - The aggregation function to use ("mean", "sum", etc).
 * @param {boolean} selectedRowsAggregationWithRelativeHeight - Whether the height of row groups should be relative to the size of the group.
 * @param {'client' | 'server'} selectedRowsAggregationMethod - Where will the aggregation be performed? Possible values: "client", "server".
 */
function setPixDataForSelectedRows(
  data,
  shape,
  setPixData,
  selectedRows,
  selectedRowsAggregationMode,
  selectedRowsAggregationWithRelativeHeight,
  selectedRowsAggregationMethod,
) {
  // We need to set the pixels in the order specified by the `selectedRows` parameter.
  /** @type {((data: number[]) => number | undefined) | undefined} */
  let aggFunc;
  /** @type {((columnIndex: number, rowIndices: number[]) => number) | undefined} */
  let aggFromDataFunc;
  if (selectedRowsAggregationMode) {
    const agg = getAggregationFunction(selectedRowsAggregationMode);
    aggFunc = agg;
    aggFromDataFunc = (colI, rowIs) =>
      agg(rowIs.map((rowI) => data[rowI * shape[1] + colI])) ?? 0;
  }
  /** @type {number} */
  let d;
  /** @type {number} */
  let pixRowI;
  /** @type {number} */
  let colI;
  /** @type {number} */
  let selectedRowI;
  /** @type {number} */
  let selectedRowGroupItemI;

  for (colI = 0; colI < shape[1]; colI++) {
    // For this column, aggregate along the row axis.
    pixRowI = 0;
    for (selectedRowI = 0; selectedRowI < selectedRows.length; selectedRowI++) {
      if (aggFunc && selectedRowsAggregationMethod === 'server') {
        d = data[selectedRowI * shape[1] + colI];
      } else if (Array.isArray(selectedRows[selectedRowI])) {
        if (!aggFromDataFunc) {
          throw new Error("row aggregation requires 'aggFromDataFunc'");
        }
        // An aggregation step must be performed for this data point.
        d = aggFromDataFunc(
          colI,
          // @ts-expect-error - selectedRows[selectedRowI] is number[] but TS can't infer that from
          selectedRows[selectedRowI],
        );
      } else {
        // @ts-expect-error - selectedRows[selectedRowI] is number but TS can't infer that from
        d = data[selectedRows[selectedRowI] * shape[1] + colI];
      }

      if (
        selectedRowsAggregationWithRelativeHeight &&
        Array.isArray(selectedRows[selectedRowI])
      ) {
        // Set a pixel for multiple rows, proportionate to the size of the row aggregation group.
        for (
          selectedRowGroupItemI = 0;
          // @ts-expect-error - selectedRows[selectedRowI] is number[] but TS can't infer that from
          selectedRowGroupItemI < selectedRows[selectedRowI].length;
          selectedRowGroupItemI++
        ) {
          setPixData(
            pixRowI * shape[1] + colI, // pixData index
            d, // data point
          );
          pixRowI++;
        }
      } else {
        // Set a single pixel, either representing a single row or an entire row group, if the vertical height for each group should be uniform (i.e. should not depend on group size).
        setPixData(
          pixRowI * shape[1] + colI, // pixData index
          d, // data point
        );
        pixRowI++;
      }
    } // end row group for
  } // end col for
}

/**
 * @typedef SelectedRowsOptions
 * @property {number[] | number[][]} selectedRows - Row indices, for ordering and filtering rows. Used by the HorizontalMultivecTrack.
 * @property {'mean' | 'sum' | 'variance' | 'deviation'} selectedRowsAggregationMode - The aggregation function to use ("mean", "sum", etc).
 * @property {boolean} selectedRowsAggregationWithRelativeHeight - Whether the height of row groups should be relative to the size of the group.
 * @property {'client' | 'server'} selectedRowsAggregationMethod - Where will the aggregation be performed? Possible values: "client", "server".
 */

/**
 * This function takes in tile data and other rendering parameters,
 * and generates an array of pixel data that can be passed to a canvas
 * (and subsequently passed to a PIXI sprite).
 *
 * @param {number} size - `data` parameter length. Often set to a tile's `tile.tileData.dense.length` value.
 * @param {Array<number>} data - The tile data array.
 * @param {'log' | 'linear'} valueScaleType 'log' or 'linear'.
 * @param {[number, number]} valueScaleDomain
 * @param {number} pseudocount - The pseudocount is generally the minimum non-zero value and is
 * used so that our log scaling doesn't lead to NaN values.
 * @param {Array<[r: number, g: number, b: number, a: number]>} colorScale
 * @param {boolean} ignoreUpperRight
 * @param {boolean} ignoreLowerLeft
 * @param {[numRows: number, numCols: number] | null} shape - Array `[numRows, numCols]`, used when iterating over a subset of rows,
 * when one needs to know the width of each column.
 * @param {[r: number, g: number, b: number, a: number] | null} zeroValueColor - The color to use for rendering zero data values, [r, g, b, a].
 * @param {Partial<SelectedRowsOptions> | null} selectedRowsOptions - Rendering options when using a `selectRows` track option.
 *
 * @returns {Uint8ClampedArray} A flattened array of pixel values.
 */
export function workerSetPix(
  size,
  data,
  valueScaleType,
  valueScaleDomain,
  pseudocount,
  colorScale,
  ignoreUpperRight = false,
  ignoreLowerLeft = false,
  shape = null,
  zeroValueColor = null,
  selectedRowsOptions = null,
) {
  /** @type {import('../types').Scale} */
  let valueScale;

  if (valueScaleType === 'log') {
    valueScale = scaleLog().range([254, 0]).domain(valueScaleDomain);
  } else {
    if (valueScaleType !== 'linear') {
      console.warn(
        'Unknown value scale type:',
        valueScaleType,
        ' Defaulting to linear',
      );
    }
    valueScale = scaleLinear().range([254, 0]).domain(valueScaleDomain);
  }

  const {
    selectedRows,
    selectedRowsAggregationMode = 'mean',
    selectedRowsAggregationWithRelativeHeight = false,
    selectedRowsAggregationMethod = 'client',
  } = selectedRowsOptions ?? {};

  let filteredSize = size;
  if (shape && selectedRows) {
    // If using the `selectedRows` parameter, then the size of the `pixData` array
    // will likely be different than `size` (the total size of the tile data array).
    // The potential for aggregation groups in `selectedRows` also must be taken into account.
    filteredSize =
      selectedItemsToSize(
        selectedRows,
        selectedRowsAggregationWithRelativeHeight,
      ) * shape[1];
  }

  let rgb;
  let rgbIdx = 0;
  const tileWidth = shape ? shape[1] : Math.sqrt(size);
  const pixData = new Uint8ClampedArray(filteredSize * 4);

  /** @type {(x: number) => number} */
  const dToRgbIdx = (x) => {
    const v = valueScale(x);
    if (Number.isNaN(v)) return 254;
    return Math.max(0, Math.min(254, Math.floor(v)));
  };

  /**
   * Set the ith element of the pixData array, using value d.
   * (well not really, since i is scaled to make space for each rgb value).
   *
   * @param {number} i - Index of the element.
   * @param {number} d - The value to be transformed and then inserted.
   */
  const setPixData = (i, d) => {
    // Transparent
    rgbIdx = 255;

    if (
      // ignore the upper right portion of a tile because it's on the diagonal
      // and its mirror will fill in that space
      !(ignoreUpperRight && Math.floor(i / tileWidth) < i % tileWidth) &&
      !(ignoreLowerLeft && Math.floor(i / tileWidth) > i % tileWidth) &&
      // Ignore color if the value is invalid
      !Number.isNaN(+d)
    ) {
      // values less than espilon are considered NaNs and made transparent (rgbIdx 255)
      rgbIdx = dToRgbIdx(d + pseudocount);
    }

    // let rgbIdx = qScale(d); //Math.max(0, Math.min(255, Math.floor(valueScale(ct))))
    if (rgbIdx < 0 || rgbIdx > 255) {
      console.warn(
        'out of bounds rgbIdx:',
        rgbIdx,
        ' (should be 0 <= rgbIdx <= 255)',
      );
    }

    if (zeroValueColor && !Number.isNaN(+d) && +d === 0.0) {
      rgb = zeroValueColor;
    } else {
      rgb = colorScale[rgbIdx];
    }

    pixData[i * 4] = rgb[0];
    pixData[i * 4 + 1] = rgb[1];
    pixData[i * 4 + 2] = rgb[2];
    pixData[i * 4 + 3] = rgb[3];
  };

  let d;
  try {
    if (selectedRows && shape) {
      // We need to set the pixels in the order specified by the `selectedRows` parameter.
      // Call the setPixDataForSelectedRows helper function,
      // which will loop over the data for us and call setPixData().
      setPixDataForSelectedRows(
        data,
        shape,
        setPixData,
        selectedRows,
        selectedRowsAggregationMode,
        selectedRowsAggregationWithRelativeHeight,
        selectedRowsAggregationMethod,
      );
    } else {
      // The `selectedRows` array has not been passed, so we want to use all of the tile data values,
      // in their default ordering.
      for (let i = 0; i < data.length; i++) {
        d = data[i];
        setPixData(i, d);
      }
    }
  } catch (err) {
    console.warn('Odd datapoint');
    console.warn('d:', d);
    d = d ?? 0;
    console.warn('valueScale.domain():', valueScale.domain());
    console.warn('valueScale.range():', valueScale.range());
    console.warn('value:', valueScale(d + pseudocount));
    console.warn('pseudocount:', pseudocount);
    console.warn('rgbIdx:', rgbIdx, 'd:', d, 'ct:', valueScale(d));
    console.error('ERROR:', err);
    return pixData;
  }

  return pixData;
}

/**
 * Yanked from https://github.com/numpy/numpy/blob/master/numpy/core/src/npymath/halffloat.c#L466
 *
 * Does not support infinities or NaN. All requests with such
 * values should be encoded as float32
 *
 * @param {number} h
 * @returns {number}
 */
function float32(h) {
  let hExp = h & 0x7c00;
  let hSig;
  let fExp;
  let fSig;

  const fSgn = (h & 0x8000) << 16;
  switch (hExp) {
    /* 0 or subnormal */
    case 0x0000:
      hSig = h & 0x03ff;
      /* Signed zero */
      if (hSig === 0) {
        return fSgn;
      }
      /* Subnormal */
      hSig <<= 1;
      while ((hSig & 0x0400) === 0) {
        hSig <<= 1;
        hExp++;
      }
      fExp = (127 - 15 - hExp) << 23;
      fSig = (hSig & 0x03ff) << 13;
      return fSgn + fExp + fSig;

    /* inf or NaN */
    case 0x7c00:
      /* All-ones exponent and a copy of the significand */
      return fSgn + 0x7f800000 + ((h & 0x03ff) << 13);

    default:
      /* normalized */
      /* Just need to adjust the exponent and shift */
      return fSgn + (((h & 0x7fff) + 0x1c000) << 13);
  }
}

/**
 * Convert a base64 string to an array buffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;

  const bytes = new Uint8Array(len);

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

/**
 * Convert a uint16 array to a float32 array
 *
 * @param {Uint16Array} uint16array
 * @returns {Float32Array}
 */
function uint16ArrayToFloat32Array(uint16array) {
  const bytes = new Uint32Array(uint16array.length);

  for (let i = 0; i < uint16array.length; i++) {
    bytes[i] = float32(uint16array[i]);
  }

  const newBytes = new Float32Array(bytes.buffer);

  return newBytes;
}

/**
 * @param {string} base64EncodedData
 * @param {string} [dtype]
 */
function base64DenseDataToFloat32Array(base64EncodedData, dtype) {
  const arrayBuffer = base64ToArrayBuffer(base64EncodedData);
  if (dtype === 'float16') {
    // data is encoded as float16s
    /* comment out until next empty line for 32 bit arrays */
    const uint16Array = new Uint16Array(arrayBuffer);
    return uint16ArrayToFloat32Array(uint16Array);
  }
  // data is encoded as float32s
  return new Float32Array(arrayBuffer);
}

/**
 * @typedef TileData<Server>
 * @property {string} server
 * @property {string} tileId
 * @property {number} zoomLevel
 * @property {number[]} tilePos
 * @property {string} tilesetUid
 */

/**
 * @typedef DenseTileData
 * @property {string} server
 * @property {string} tileId
 * @property {number} zoomLevel
 * @property {number[]} tilePos
 * @property {string} tilesetUid
 * @property {Float32Array} dense
 * @property {string} dtype
 * @property {DenseDataExtrema1D | DenseDataExtrema2D} denseDataExtrema
 * @property {number} minNonZero
 * @property {number} maxNonZero
 */

/**
 * @template T
 * @typedef {Omit<T, keyof DenseTileData> & (TileData | DenseTileData)} CompletedTileData
 */

/**
 * @typedef TileResponse
 * @property {string=} dense - a base64 encoded string
 * @property {string=} dtype - the dtype of the dense array
 */

/**
 * @param {string} tileId
 * @returns {[tilesetUid: string, zoomLevel: number, tilePos: [number] | [number, number]]}
 */
function extractKeyParts(tileId) {
  const [tilesetUid, zoomLevelString, ...remainingParts] = tileId.split('.');
  /** @type {[number, number] | [number]} */
  // @ts-expect-error - We could verify this with a custom type-gaurd
  const tilePos = remainingParts.map((x) => +x).filter((x) => !Number.isNaN(x));
  return [tilesetUid, +zoomLevelString, tilePos];
}

/**
 * Convert a response from the tile server to data that can be used by higlass.
 *
 * WARNING: Mutates the data object.
 *
 * @template {TileResponse} T
 * @param {Record<string, T>} tileResponses
 * @param {string} server
 * @param {string[]} theseTileIds
 *
 * @returns {Record<string, CompletedTileData<T>>}
 *
 * Trevor: This function is littered with ts-expect-error comments because
 * the type of mutation happening to the input object is very tricky to type.
 * The type signature of the function tries to adequately describe the mutation,
 * to outside users.
 */
export function tileResponseToData(tileResponses, server, theseTileIds) {
  /** @type {Record<string, CompletedTileData<T>>} */
  const output = {};

  for (const tileId of theseTileIds) {
    const tileResponse = tileResponses[tileId] ?? {};
    const [tilesetUid, zoomLevel, tilePos] = extractKeyParts(tileId);

    if (tileResponse.dense) {
      const dense = base64DenseDataToFloat32Array(
        tileResponse.dense,
        tileResponse.dtype,
      );
      const denseDataExtrema =
        tilePos.length === 2
          ? new DenseDataExtrema2D(dense)
          : new DenseDataExtrema1D(dense);
      output[tileId] = Object.assign(tileResponse, {
        server,
        tileId,
        tilePos,
        zoomLevel,
        tilesetUid,
        dense,
        denseDataExtrema,
        minNonZero: denseDataExtrema.minNonZeroInTile,
        maxNonZero: denseDataExtrema.maxNonZeroInTile,
      });
    } else {
      output[tileId] = Object.assign(tileResponse, {
        server,
        tileId,
        tilePos,
        zoomLevel,
        tilesetUid,
      });
    }
  }

  return output;
}

/**
 * Fetch tiles from the server.
 *
 * @param {string} outUrl
 * @param {string} server
 * @param {string[]} theseTileIds
 * @param {string} authHeader
 * @param {(data: Record<string, CompletedTileData<TileResponse>>) => void} done
 * @param {Record<string, unknown>} requestBody
 */
export function workerGetTiles(
  outUrl,
  server,
  theseTileIds,
  authHeader,
  done,
  requestBody,
) {
  /** @type {Record<string, string>} */
  const headers = {
    'content-type': 'application/json',
  };

  if (authHeader) headers.Authorization = authHeader;

  fetch(outUrl, {
    credentials: 'same-origin',
    headers,
    ...(requestBody && Object.keys(requestBody).length > 0
      ? {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      : {}),
  })
    .then((response) => response.json())
    .then((data) => {
      done(tileResponseToData(data, server, theseTileIds));
    })
    .catch((err) => console.warn('err:', err));
}
