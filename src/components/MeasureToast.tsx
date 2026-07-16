import React, { useEffect } from 'react';
import '../styles/components/MeasureToast.css';

interface MeasureToastProps {
  message: string;
  description?: string;
  onClose: () => void;
  duration?: number;
}

const imgCheck = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E`;

const imgClose = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23056764' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E`;

const MeasureToast: React.FC<MeasureToastProps> = ({ message, description, onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className="toast-container">
      <div className="toast-success">
        <div className="toast-content">
          <div className="toast-icon-container">
            <div className="toast-icon-background">
              <img src={imgCheck} alt="" className="toast-icon-check" />
            </div>
          </div>
          <div className="toast-text-container">
            <p className="toast-message">{message}</p>
            {description && <p className="toast-description">{description}</p>}
          </div>
        </div>
        <button className="toast-close-button" onClick={onClose}>
          <img src={imgClose} alt="Close" className="toast-close-icon" />
        </button>
      </div>
    </div>
  );
};

export default MeasureToast;
