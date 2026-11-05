export const PIPELINE_STAGES = ['sourced', 'screened', 'submitted', 'shortlisted', 'interview', 'offered', 'joined'];

export const STAGE_LABEL = {
  sourced: 'Sourced',
  screened: 'Screened',
  submitted: 'With client',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  joined: 'Joined',
  rejected: 'Rejected',
};

export const bandOf = (score) =>
  score == null ? 'unscored' : score >= 75 ? 'strong' : score >= 50 ? 'possible' : 'low';
export const BAND_LABEL = {
  strong: 'Strong match',
  possible: 'Possible match',
  low: 'Low match',
  unscored: 'Not scored',
};
export const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

export function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const formatSlot = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const noticeLabel = (days) => (days == null ? 'Notice n/a' : days === 0 ? 'Immediate' : `${days} days`);

export const yearsLabel = (years) => (years == null ? 'n/a' : `${years} yrs`);

/** Escapes a string for use inside a RegExp. */
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Default value for a datetime-local input: tomorrow, 11:00. */
export function tomorrowAtEleven() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setHours(11, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
