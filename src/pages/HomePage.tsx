import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useIndustry, type IndustryType } from '../contexts/IndustryContext';
import '../styles/pages/HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { setIndustry } = useIndustry();

  const handleIndustrySelect = (next: IndustryType) => {
    setIndustry(next);
    if (next === 'manufacturing') {
      navigate('/home/manufacturing');
    } else if (next === 'consumer-goods') {
      navigate('/home/consumergoods');
    } else {
      navigate('/home/grid-264');
    }
  };

  return (
    <div className="home-page">
      <div className="home-page-container">
        <h1 className="home-page-title">Select Industry Type</h1>
        <div className="industry-tiles">
          <div 
            className="industry-tile"
            onClick={() => handleIndustrySelect('manufacturing')}
          >
            <div className="tile-icon">🏭</div>
            <h2 className="tile-title">Manufacturing Industry</h2>
          </div>
          <div 
            className="industry-tile"
            onClick={() => handleIndustrySelect('consumer-goods')}
          >
            <div className="tile-icon">🛒</div>
            <h2 className="tile-title">Consumer Goods Industry</h2>
          </div>
          <div
            className="industry-tile"
            onClick={() => handleIndustrySelect('grid-264')}
          >
            <div className="tile-icon">📊</div>
            <h2 className="tile-title">264 Updated Grid</h2>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
