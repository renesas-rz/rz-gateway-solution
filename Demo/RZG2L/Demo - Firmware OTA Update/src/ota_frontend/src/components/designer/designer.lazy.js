import React, { lazy, Suspense } from 'react';

const LazyDesigner = lazy(() => import('./Designer'));

const Designer = props => (
  <Suspense fallback={null}>
    <LazyDesigner {...props} />
  </Suspense>
);

export default Designer;
