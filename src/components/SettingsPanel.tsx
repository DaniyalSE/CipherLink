/**
 * Settings Panel Component
 * 
 * Allows users to customize the terminal appearance and behavior.
 * Settings are persisted to localStorage.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, Palette, Type, Zap, Volume2, Monitor, 
  RotateCcw, Key, Shield, AlertTriangle, ExternalLink 
} from 'lucide-react';
import { useSettings, ThemeColor } from '@/lib/settings-context';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface SettingsPanelProps {
  onGenerateKeypair: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onGenerateKeypair }) => {
  const { settings, updateSettings, resetSettings } = useSettings();

  const themeColors: { value: ThemeColor; label: string; color: string }[] = [
    { value: 'green', label: 'Matrix Green', color: 'bg-green-500' },
    { value: 'amber', label: 'Retro Amber', color: 'bg-amber-500' },
    { value: 'cyan', label: 'Cyber Cyan', color: 'bg-cyan-500' },
  ];

  const fontSizes: { value: typeof settings.fontSize; label: string }[] = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ];

  const animationSpeeds: { value: typeof settings.animationSpeed; label: string }[] = [
    { value: 'slow', label: 'Slow' },
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' },
  ];

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Settings className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold terminal-text">Terminal Settings</h2>
      </div>

      {/* Appearance Section */}
      <SettingsSection icon={Palette} title="Appearance">
        {/* Theme color */}
        <div className="space-y-3">
          <Label className="text-muted-foreground">Terminal Theme</Label>
          <div className="flex gap-3">
            {themeColors.map(({ value, label, color }) => (
              <button
                key={value}
                onClick={() => updateSettings({ theme: value })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  settings.theme === value 
                    ? 'border-primary bg-secondary' 
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                <div className={`w-4 h-4 rounded-full ${color}`} />
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div className="space-y-3">
          <Label className="text-muted-foreground">Font Size</Label>
          <div className="flex gap-2">
            {fontSizes.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateSettings({ fontSize: value })}
                className={`flex-1 px-4 py-2 rounded-lg border transition-all text-sm ${
                  settings.fontSize === value 
                    ? 'border-primary bg-secondary' 
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* CRT effect toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label>CRT Scanlines</Label>
              <p className="text-xs text-muted-foreground">Retro monitor effect</p>
            </div>
          </div>
          <Switch
            checked={settings.crtEffect}
            onCheckedChange={(checked) => updateSettings({ crtEffect: checked })}
          />
        </div>

        {/* Matrix background toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Type className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label>Matrix Background</Label>
              <p className="text-xs text-muted-foreground">Animated code rain effect</p>
            </div>
          </div>
          <Switch
            checked={settings.matrixBackground}
            onCheckedChange={(checked) => updateSettings({ matrixBackground: checked })}
          />
        </div>
      </SettingsSection>

      {/* Animation Section */}
      <SettingsSection icon={Zap} title="Animations">
        {/* Animation speed */}
        <div className="space-y-3">
          <Label className="text-muted-foreground">Animation Speed</Label>
          <div className="flex gap-2">
            {animationSpeeds.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => updateSettings({ animationSpeed: value })}
                className={`flex-1 px-4 py-2 rounded-lg border transition-all text-sm ${
                  settings.animationSpeed === value 
                    ? 'border-primary bg-secondary' 
                    : 'border-border hover:border-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sound effects toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label>Sound Effects</Label>
              <p className="text-xs text-muted-foreground">Terminal beeps and notifications</p>
            </div>
          </div>
          <Switch
            checked={settings.soundEffects}
            onCheckedChange={(checked) => updateSettings({ soundEffects: checked })}
          />
        </div>
      </SettingsSection>

      {/* Security Section */}
      <SettingsSection icon={Shield} title="Security">
        {/* Keypair generation */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Key className="w-4 h-4 text-muted-foreground mt-1" />
            <div className="flex-1">
              <Label>Encryption Keypair</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Generate a new RSA/ECC keypair for message signing. 
                Private key is stored server-side only.
              </p>
            </div>
          </div>
          <Button onClick={onGenerateKeypair} variant="secondary" className="w-full">
            <Key className="w-4 h-4 mr-2" />
            Generate New Keypair
          </Button>
        </div>

        {/* Security warning */}
        <div className="p-4 bg-terminal-amber/10 border border-terminal-amber/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-terminal-amber flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-terminal-amber mb-2">Security Notice</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Never share your credentials or OTP codes</li>
                <li>• All sessions should use HTTPS in production</li>
                <li>• Client-side signing is for demo purposes only</li>
                <li>• Real cryptographic operations occur server-side</li>
              </ul>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Actions */}
      <div className="pt-4 border-t border-border flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={resetSettings}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset to Defaults
        </Button>

        <Button
          variant="ghost"
          asChild
          className="text-muted-foreground hover:text-foreground"
        >
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Documentation
          </a>
        </Button>
      </div>

      {/* Version info */}
      <div className="text-center text-xs text-muted-foreground pt-4">
        <p>SecureTerminal v1.0.0</p>
        <p className="mt-1">
          Mock Mode: {import.meta.env.VITE_MOCK_MODE === 'true' ? 'Enabled' : 'Disabled'}
        </p>
      </div>
    </div>
  );
};

// Settings section wrapper
interface SettingsSectionProps {
  icon: React.FC<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ icon: Icon, title, children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="terminal-window p-4 space-y-4"
  >
    <div className="flex items-center gap-2 pb-2 border-b border-border">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="font-medium text-foreground">{title}</h3>
    </div>
    <div className="space-y-4">
      {children}
    </div>
  </motion.div>
);

export default SettingsPanel;
