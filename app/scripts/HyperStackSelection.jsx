/* eslint-disable */
import * as React from "react";
import { scaleLinear } from "d3-scale";

import styles from "./HyperStackSelection.module.css";

/** @param {import('pub-sub-es').PubSub} pubSub */
function useAltKeyDown(pubSub) {
  const [altKeyDown, setAltKeyDown] = React.useState(false);
  React.useEffect(() => {
    const tokens = [
      pubSub.subscribe('app.altKeyDown', () => {
        setAltKeyDown(true);
      }),
      pubSub.subscribe('app.altKeyUp', () => {
        setAltKeyDown(false);
      }),
    ];
    return () => {
      tokens.forEach((token) => pubSub.unsubscribe(token));
    };
  }, []);
  return altKeyDown;
}

/**
 * @typedef Props
 * @property {Array<{ label: string, distance: number }>} stack
 * @property {import('pub-sub-es').PubSub} pubSub
 */

/** @type {React.FC<Props>} */
const HyperStackSelection = (props) => {
  const altKeyDown = useAltKeyDown(props.pubSub);
  const stack = props.stack ?? [
    { label: 'A', distance: 10 },
    { label: 'B', distance: 4 },
    { label: 'C', distance: 8 },
    { label: 'D', distance: 2 },
    { label: 'E', distance: 0 },
  ];

  const maxWidth = 400;
  const totalDistance = stack.reduce((acc, item) => acc + item.distance, 0);
  const scale = scaleLinear()
    .domain([0, totalDistance])
    .range([0, maxWidth]);

  return (
    <div className={styles["hyperstack"]}>
      <div className={styles['timeline-labels']}>
        {stack.map((item) => (
          <div
            key={item.label}
            className={styles['timepoint-label']}
            style={{ marginRight: scale(item.distance || 0) }}
          >
            {item.label}
          </div>
        ))}
      </div>
      <div className={styles['timeline']}>
        {stack.map((item) => (
          <div 
            key={item.label}
            className={styles['timepoint']}
            style={{ marginRight: scale(item.distance || 0) }}
          >
            <span className={styles['dot']}></span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HyperStackSelection;
