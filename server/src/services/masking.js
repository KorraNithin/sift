/** Contact masking for the client portal. Clients never see raw email or phone. */
export function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = email.split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
}

export function maskPhone(phone) {
  return phone ? `+91 ••••• ••${String(phone).slice(-3)}` : null;
}

/** "Ritika Bansal" becomes "Ritika B." */
export function maskName(name) {
  const [first, ...rest] = String(name).trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const LINK = /(?:https?:\/\/)?(?:www\.)?(?:linkedin|github)\.com\/\S+/gi;

/** Hides contact details inside free text while leaving the rest of the CV readable. */
export const redactContacts = (text) =>
  String(text).replace(EMAIL, '[email hidden]').replace(PHONE, '[phone hidden]').replace(LINK, '[link hidden]');
