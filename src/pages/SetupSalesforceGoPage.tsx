import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SetupSalesforceGoPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data && e.data.type === 'navigate' && typeof e.data.to === 'string') {
        navigate(e.data.to);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate]);

  return (
    <iframe
      title="Salesforce Go"
      src={`${import.meta.env.BASE_URL}sfgo.html?v=4`}
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', border: 'none' }}
    />
  );
};

export default SetupSalesforceGoPage;
