const activePlayers = new Map<string, () => void>();

/**
 * Registers a mounted Remotion Player instance with a pause callback so that
 * starting playback in any player immediately pauses all other players.
 */
export function registerVideoPlayer(
  playerId: string,
  pause: () => void
): () => void {
  activePlayers.set(playerId, pause);
  return () => {
    activePlayers.delete(playerId);
  };
}

/**
 * Notifies the coordinator that `startedPlayerId` began playing, pausing
 * every other currently registered player.
 */
export function notifyVideoPlayerStarted(startedPlayerId: string): void {
  for (const [id, pause] of activePlayers.entries()) {
    if (id !== startedPlayerId) {
      try {
        pause();
      } catch {
        // Ignore errors from players in the middle of unmounting.
      }
    }
  }
}
