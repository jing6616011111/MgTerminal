import React from 'react';

interface AppLogoProps {
  className?: string;
}

/**
 * Product mark used in the vault sidebar / about surfaces.
 * Uses the packaged app icon so UI branding matches Dock / installer artwork.
 */
export const AppLogo: React.FC<AppLogoProps> = ({ className }) => (
  <img
    src="/icon.png"
    alt="MagiesTerminal"
    className={className}
    draggable={false}
  />
);

export default AppLogo;
