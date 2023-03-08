import React from 'react';

// import toVoid from '@higlass/core/src/scripts/utils/to-void';

const fake = {
  __fake__: true,
  publish: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
};

const { Provider, Consumer } = React.createContext(fake);

// Higher order component
const withPubSub = (Component) =>
  React.forwardRef((props, ref) => (
    <Consumer>
      {(pubSub) => <Component ref={ref} {...props} pubSub={pubSub} />}
    </Consumer>
  ));

export default withPubSub;

export { fake, Provider };
