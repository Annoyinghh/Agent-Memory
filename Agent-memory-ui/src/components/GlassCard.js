'use client';

import React from 'react';

export default function GlassCard({ children, className = '', title = '', glowColor = 'cyan', style = {} }) {
  const glowClass = glowColor === 'purple' ? 'glass-card-purple' : '';

  return (
    <div className={`glass-card ${glowClass} ${className}`} style={style}>
      {title && (
        <div className="card-header-wrapper">
          <h3 className="card-title-text">{title}</h3>
          <div className="title-underline"></div>
        </div>
      )}
      <div className="card-content-wrapper">{children}</div>

      <style jsx>{`
        .card-header-wrapper {
          margin-bottom: 20px;
          position: relative;
        }

        .card-title-text {
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 0.5px;
          color: hsl(var(--text-primary));
        }

        .title-underline {
          margin-top: 6px;
          height: 2px;
          width: 30px;
          background: ${glowColor === 'purple' 
            ? 'linear-gradient(90deg, hsl(var(--color-purple)), transparent)'
            : 'linear-gradient(90deg, hsl(var(--color-cyan)), transparent)'
          };
          border-radius: 1px;
        }

        .card-content-wrapper {
          width: 100%;
        }
      `}</style>
    </div>
  );
}
