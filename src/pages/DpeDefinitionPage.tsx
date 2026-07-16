import React from 'react';

/**
 * Renders the "1st DPE Definition" page exactly as captured from the source org.
 * The snapshot is a fully self-contained HTML (CSS + images inlined) served as a
 * static asset from `public/1st_dpe.html`; embedding it in a full-viewport iframe
 * reproduces the original.
 */
const DpeDefinitionPage: React.FC = () => {
  return (
    <iframe
      title="1st DPE Definition"
      src={`${import.meta.env.BASE_URL}1st_dpe.html`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
      }}
    />
  );
};

export default DpeDefinitionPage;
