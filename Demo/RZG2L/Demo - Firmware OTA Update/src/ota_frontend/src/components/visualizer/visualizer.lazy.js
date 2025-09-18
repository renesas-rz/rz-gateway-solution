import React, { lazy, Suspense } from 'react';

const LazyVisualizer = lazy(() => import('./Visualizer'));

const Visualizer = props => (
  <Suspense fallback={null}>
    <LazyVisualizer {...props} />
  </Suspense>
);

export default Visualizer;
