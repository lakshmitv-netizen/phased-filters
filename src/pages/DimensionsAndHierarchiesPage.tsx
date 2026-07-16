import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Reuses the Plan Configuration setup shell (header + side nav) from the static
// export, but in an empty "dimensions" mode: the list content is hidden and the
// "Dimensions and Hierarchies" nav item is shown as selected.
const DimensionsAndHierarchiesPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'navigate' && e.data.path) {
        navigate(e.data.path, { state: { planName: e.data.planName, description: e.data.description } });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate]);

  return (
    <iframe
      title="Dimensions and Hierarchies"
      src={`${import.meta.env.BASE_URL}plc_list.html?view=dimensions`}
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

export default DimensionsAndHierarchiesPage;
