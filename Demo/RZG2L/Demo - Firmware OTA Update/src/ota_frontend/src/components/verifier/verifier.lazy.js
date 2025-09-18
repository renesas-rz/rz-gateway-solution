import React, { lazy, Suspense } from 'react';

const LazyVerifier = lazy(() => import('./Verifier'));

const Verifier = props => (
  <Suspense fallback={null}>
    <LazyVerifier {...props} />
  </Suspense>
);

export default Verifier;
