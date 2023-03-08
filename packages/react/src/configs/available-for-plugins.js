/**
 * Code that is available to plugin tracks.
 */

import { AVAILABLE_FOR_PLUGINS } from '@higlass/core';

import HorizontalTiledPlot from '../HorizontalTiledPlot';
import HorizontalTrack from '../HorizontalTrack';
import MoveableTrack from '../MoveableTrack';
import VerticalTrack from '../VerticalTrack';

const tracks = {
  ...AVAILABLE_FOR_PLUGINS.tracks,
  HorizontalTiledPlot,
  HorizontalTrack,
  MoveableTrack,
  VerticalTrack,
};

import ContextMenuItem from '../ContextMenuItem';

const factories = {
  ...AVAILABLE_FOR_PLUGINS.factories,
  ContextMenuItem,
};

export default {
  ...AVAILABLE_FOR_PLUGINS,
  tracks,
  factories
}
