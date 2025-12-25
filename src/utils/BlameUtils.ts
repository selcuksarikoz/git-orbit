/**
 * Utility functions for Git blame visualization
 */

export interface AgeBasedColors {
  hex: string;
  rgba: string;
}

/**
 * Get colors based on code age for visualization
 * @param timestamp Unix timestamp of the commit
 * @returns Object containing both hex and rgba color strings
 */
export function getAgeBasedColor(timestamp: number): AgeBasedColors {
  const ageInDays = (Date.now() / 1000 - timestamp) / 86400;

  if (ageInDays < 1) {
    // 🔴 Hot - less than 1 day old
    return {
      hex: '#ff4444',
      rgba: 'rgba(100, 255, 100, 0.8)',
    };
  } else if (ageInDays < 7) {
    // 🟠 Warm - less than a week old
    return {
      hex: '#ff8844',
      rgba: 'rgba(150, 220, 150, 0.7)',
    };
  } else if (ageInDays < 30) {
    // 🟡 Moderate - less than a month old
    return {
      hex: '#ffcc44',
      rgba: 'rgba(200, 200, 100, 0.6)',
    };
  } else if (ageInDays < 90) {
    // 🔵 Cool - less than 3 months old
    return {
      hex: '#4488ff',
      rgba: 'rgba(180, 180, 180, 0.6)',
    };
  } else if (ageInDays < 365) {
    // 🔵 Cold - less than a year old
    return {
      hex: '#4466cc',
      rgba: 'rgba(140, 140, 140, 0.5)',
    };
  } else {
    // ⚫ Ancient - over a year old
    return {
      hex: '#666666',
      rgba: 'rgba(100, 100, 100, 0.4)',
    };
  }
}

/**
 * Format timestamp as relative time (e.g., "2 days ago")
 * @param timestamp Unix timestamp
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);

  if (seconds < 60) return 'just now';

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
}
