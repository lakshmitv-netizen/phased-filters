import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MeasureToast from '../components/MeasureToast';

const PlanConfigurationListPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Success toast shown after a plan configuration is saved from the builder.
  const [showSaveToast, setShowSaveToast] = useState(false);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'navigate' && e.data.path) {
        navigate(e.data.path, {
          state: {
            planName: e.data.planName,
            description: e.data.description,
            configId: e.data.configId,
          },
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate]);

  useEffect(() => {
    const saved = (location.state as { savedToast?: boolean } | undefined)?.savedToast;
    if (!saved) return;
    setShowSaveToast(true);
    // Clear the flag so the toast doesn't reappear on refresh/back navigation.
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate]);

  return (
    <>
      <iframe
        title="Plan Configuration List"
        src={`${import.meta.env.BASE_URL}plc_list.html`}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
      />
      {showSaveToast && (
        <MeasureToast
          message="Configuration saved"
          description="Your plan configuration was saved successfully."
          onClose={() => setShowSaveToast(false)}
        />
      )}
    </>
  );
};

export default PlanConfigurationListPage;
