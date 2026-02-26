/// <reference types="@testing-library/jest-dom" />
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';

// Mock Tauri API
const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: unknown) => args !== undefined ? mockInvoke(cmd, args) : mockInvoke(cmd),
}));

// Mock SettingsModal
vi.mock('./components/SettingsModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="settings-modal">
        <span>Mock Settings Modal</span>
        <button onClick={onClose} aria-label="Close">Close</button>
      </div>
    ) : null
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockInvoke.mockImplementation((cmd: string) => {
      switch (cmd) {
        case 'get_current_time':
          return Promise.resolve('12:00:00');
        case 'check_alarms':
          return Promise.resolve(null);
        case 'get_alarms':
          return Promise.resolve([]);
        case 'get_config':
          return Promise.resolve({
            spotify_client_id: 'test-client-id',
            spotify_client_secret: null,
            spotify_redirect_uri: 'http://localhost:8888/callback',
            default_volume: 80,
            default_fade_in_duration: 300
          });
        case 'is_spotify_authenticated':
          return Promise.resolve(false);
        default:
          return Promise.resolve(null);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders clock', async () => {
    vi.useFakeTimers();
    render(<App />);
    await vi.advanceTimersByTimeAsync(1001);
    expect(screen.getByText('12:00:00')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows Inactif status when no alarms are active', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_alarms') return Promise.resolve([]);
      return Promise.resolve(null);
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Inactif')).toBeInTheDocument();
    });
  });

  it('renders the time input with default value', () => {
    render(<App />);
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
  });

  it('handles IPC errors gracefully for get_current_time', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_current_time') {
        return Promise.reject(new Error('IPC Error'));
      }
      if (cmd === 'check_alarms') return Promise.resolve(null);
      if (cmd === 'get_alarms') return Promise.resolve([]);
      if (cmd === 'get_config') return Promise.resolve({});
      return Promise.resolve(null);
    });

    render(<App />);

    expect(screen.getByText('00:00:00')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('creates a new alarm when set button is clicked', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'get_alarms') return Promise.resolve([]);
      if (cmd === 'set_alarm') return Promise.resolve({ id: 'new-id' });
      return Promise.resolve(null);
    });

    render(<App />);

    const alarmButton = await screen.findByRole('button', { name: /ajouter l'alarme/i });
    fireEvent.click(alarmButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_alarm', expect.anything());
    });
  });

  it('changes alarm time when input value changes', () => {
    render(<App />);

    const timeInput = screen.getByDisplayValue('08:00');
    fireEvent.change(timeInput, { target: { value: '09:30' } });

    expect(timeInput).toHaveValue('09:30');
  });

  it('handles set_alarm error gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_alarms') return Promise.resolve([]);
      if (cmd === 'set_alarm') return Promise.reject(new Error('Set alarm failed'));
      return Promise.resolve(null);
    });

    render(<App />);

    const alarmButton = await screen.findByRole('button', { name: /ajouter l'alarme/i });
    fireEvent.click(alarmButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    consoleErrorSpy.mockRestore();
  });

  it('renders the header with logo', () => {
    render(<App />);

    // Check for logo and title
    expect(screen.getByText('Charmed')).toBeInTheDocument();
    expect(screen.getByText('Spotify Alarm Clock')).toBeInTheDocument();
  });

  it('renders glass-panel containers', () => {
    render(<App />);

    const glassPanels = document.querySelectorAll('.glass-panel');
    expect(glassPanels.length).toBeGreaterThan(0);
  });

  it('renders gradient background', () => {
    render(<App />);

    const gradientBg = document.querySelector('.gradient-bg');
    expect(gradientBg).toBeInTheDocument();
  });

  it('renders status indicator', () => {
    render(<App />);

    // The status indicator shows "Inactif" when no alarms
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('renders Spotify connect button', () => {
    render(<App />);

    expect(screen.getByText('Connecter Spotify')).toBeInTheDocument();
  });

  it('loads config on mount and sets client ID input', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_config') {
        return Promise.resolve({
          spotify_client_id: 'persistent-id-123',
          spotify_client_secret: null,
          spotify_redirect_uri: 'http://localhost:8888/callback',
          default_volume: 80,
          default_fade_in_duration: 300
        });
      }
      if (cmd === 'is_spotify_authenticated') return Promise.resolve(false);
      if (cmd === 'get_alarms') return Promise.resolve([]);
      if (cmd === 'get_current_time') return Promise.resolve('12:00:00');
      if (cmd === 'check_alarms') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    render(<App />);

    // Wait for the button to be available (The initial state is "Connecter Spotify")
    const connectBtn = await screen.findByRole('button', { name: /connecter spotify/i });
    fireEvent.click(connectBtn);

    // Wait for the panel to appear and click "Commencer la configuration"
    const startBtn = await screen.findByRole('button', { name: /commencer la configuration/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('persistent-id-123')).toBeInTheDocument();
    });
  });

  it('triggers Spotify playback when an alarm is triggered with a playlist', async () => {
    vi.useFakeTimers();
    const triggeredAlarm = {
      id: 'alarm-1',
      time: '12:00',
      playlist_name: 'Test Playlist',
      playlist_uri: 'spotify:playlist:123',
      volume: 75,
      active: true,
      days: [],
      fade_in: false,
      fade_in_duration: 10
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'check_alarms') return Promise.resolve(triggeredAlarm);
      if (cmd === 'get_current_time') return Promise.resolve('12:00:00');
      if (cmd === 'get_alarms') return Promise.resolve([triggeredAlarm]);
      if (cmd === 'get_config') return Promise.resolve({});
      return Promise.resolve(null);
    });

    render(<App />);

    // Clear initial mount calls
    mockInvoke.mockClear();

    // Advance timers and wait for promises to resolve
    await vi.advanceTimersByTimeAsync(1001);

    expect(mockInvoke).toHaveBeenCalledWith('play_spotify_playlist', { playlistUri: 'spotify:playlist:123' });
    expect(mockInvoke).toHaveBeenCalledWith('set_spotify_volume', { volume: 75 });

    vi.useRealTimers();
  });

  it('falls back to local alarm if Spotify playback fails', async () => {
    vi.useFakeTimers();
    const triggeredAlarm = {
      id: 'alarm-1',
      time: '12:00',
      playlist_name: 'Test Playlist',
      playlist_uri: 'spotify:playlist:123',
      volume: 75,
      active: true,
      days: [],
      fade_in: false,
      fade_in_duration: 10
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'check_alarms') return Promise.resolve(triggeredAlarm);
      if (cmd === 'get_current_time') return Promise.resolve('12:00:00');
      if (cmd === 'get_alarms') return Promise.resolve([triggeredAlarm]);
      if (cmd === 'get_config') return Promise.resolve({});
      if (cmd === 'play_spotify_playlist') return Promise.reject(new Error('Spotify error'));
      return Promise.resolve(null);
    });

    render(<App />);

    // Clear initial calls from mount
    mockInvoke.mockClear();

    // Advance timers
    await vi.advanceTimersByTimeAsync(1001);

    expect(mockInvoke).toHaveBeenCalledWith('play_local_alarm');

    vi.useRealTimers();
  });

  it('toggles an alarm when the power button is clicked', async () => {
    const alarm = {
      id: 'alarm-1',
      time: '08:00',
      playlist_name: 'Local',
      playlist_uri: 'local',
      volume: 100,
      active: true,
      days: [],
      fade_in: false,
      fade_in_duration: 0
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_alarms') return Promise.resolve([alarm]);
      if (cmd === 'toggle_alarm') return Promise.resolve(false);
      return Promise.resolve(null);
    });

    render(<App />);

    // Wait for the alarm to resolve and render
    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    const toggleButton = screen.getByLabelText(/désactiver l'alarme/i);
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('toggle_alarm', { alarmId: 'alarm-1' });
    });
  });

  it('deletes an alarm when the trash button is clicked', async () => {
    const alarm = {
      id: 'alarm-1',
      time: '08:00',
      playlist_name: 'Local',
      playlist_uri: 'local',
      volume: 100,
      active: true,
      days: [],
      fade_in: false,
      fade_in_duration: 0
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'get_alarms') return Promise.resolve([alarm]);
      if (cmd === 'delete_alarm') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('08:00')).toBeInTheDocument();
    });

    const deleteButton = screen.getByLabelText(/supprimer l'alarme/i);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('delete_alarm', { alarmId: 'alarm-1' });
    });
  });
});