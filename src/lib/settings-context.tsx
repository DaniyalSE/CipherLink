/**
 * Settings Context
 * 
 * Manages application settings like theme, font size, and visual effects.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeColor = 'green' | 'amber' | 'cyan';

interface Settings {
  theme: ThemeColor;
  matrixBackground: boolean;
  fontSize: 'small' | 'medium' | 'large';
  animationSpeed: 'slow' | 'normal' | 'fast';
  soundEffects: boolean;
  crtEffect: boolean;
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (updates: Partial<Settings>) => void;
  resetSettings: () => void;
}

const defaultSettings: Settings = {
  theme: 'green',
  matrixBackground: false,
  fontSize: 'medium',
  animationSpeed: 'normal',
  soundEffects: false,
  crtEffect: true,
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('terminal-settings');
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('terminal-settings', JSON.stringify(settings));
    
    // Apply theme class to document
    document.documentElement.classList.remove('theme-green', 'theme-amber', 'theme-cyan');
    if (settings.theme !== 'green') {
      document.documentElement.classList.add(`theme-${settings.theme}`);
    }
  }, [settings]);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
