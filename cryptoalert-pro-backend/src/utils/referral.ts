export function generateReferralCode() {
  return `CAP${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
