/**
 * Settings Panel Component
 * 
 * Allows users to customize the terminal appearance and behavior.
 * Settings are persisted to localStorage.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Settings, Palette, Type, Zap, Volume2, Monitor, 
  RotateCcw, Key, Shield, AlertTriangle, ExternalLink, Trash2
} from 'lucide-react';
import { useSettings, ThemeColor } from '@/lib/settings-context';
import { deleteAccount, logout } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

interface SettingsPanelProps {
  onGenerateKeypair: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onGenerateKeypair }) => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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

      {/* Account Management Section */}
      <SettingsSection icon={Trash2} title="Account Management">
        {!showDeleteForm ? (
          <div className="space-y-3">
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive mb-2">Danger Zone</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Deleting your account will permanently remove all your data including:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>All messages and conversation history</li>
                    <li>All contacts and session keys</li>
                    <li>All KDC and PFS sessions</li>
                    <li>All key lifecycle events</li>
                    <li>Your encryption keypairs</li>
                  </ul>
                  <p className="text-xs text-destructive mt-3 font-medium">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => setShowDeleteForm(true)}
              variant="destructive"
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete My Account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive font-medium mb-2">
                Confirm Account Deletion
              </p>
              <p className="text-xs text-muted-foreground">
                Please enter your password to confirm account deletion.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="delete-password" className="text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                  className="mt-1"
                  disabled={isDeleting}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="delete-confirm"
                  checked={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.checked)}
                  disabled={isDeleting}
                  className="rounded border-border bg-input"
                />
                <Label htmlFor="delete-confirm" className="text-sm cursor-pointer">
                  I understand this action is permanent and cannot be undone
                </Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowDeleteForm(false);
                  setDeletePassword('');
                  setDeleteConfirm(false);
                }}
                variant="ghost"
                className="flex-1"
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!deletePassword) {
                    toast({
                      title: 'Password Required',
                      description: 'Please enter your password to delete your account.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  if (!deleteConfirm) {
                    toast({
                      title: 'Confirmation Required',
                      description: 'Please confirm that you understand this action is permanent.',
                      variant: 'destructive',
                    });
                    return;
                  }

                  setIsDeleting(true);
                  try {
                    await deleteAccount({
                      password: deletePassword,
                      confirm: deleteConfirm,
                    });
                    toast({
                      title: 'Account Deleted',
                      description: 'Your account and all associated data have been permanently deleted.',
                    });
                    logout();
                    navigate('/auth');
                  } catch (error: any) {
                    const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to delete account';
                    toast({
                      title: 'Deletion Failed',
                      description: errorMessage,
                      variant: 'destructive',
                    });
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                variant="destructive"
                className="flex-1"
                disabled={isDeleting || !deletePassword || !deleteConfirm}
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </Button>
            </div>
          </div>
        )}
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
