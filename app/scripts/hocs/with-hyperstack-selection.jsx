// @ts-nocheck
import * as React from 'react';

export const HyperstackSelectionContext = React.createContext();

export function withHyperstackSelection(Component) {
  return React.forwardRef((props, ref) => {
    const value = React.useContext(HyperstackSelectionContext);
    if (!value) {
      throw new Error(
        'HyperstackSelectionContext is not defined. Please use HyperstackSelectionProvider',
      );
    }
    return <Component ref={ref} {...props} hyperstackSelection={value} />;
  });
}
