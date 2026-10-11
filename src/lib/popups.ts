// Coordinates the site's entry popups so they never stack on top of each other.
// The TikTok popup opens first; the email promo popup waits until it's closed.
export const TIKTOK_POPUP_CLOSED_EVENT = 'tiktok-popup-closed';

let tiktokPopupOpen = false;

export const isTikTokPopupOpen = () => tiktokPopupOpen;

export const setTikTokPopupOpen = (open: boolean) => {
  tiktokPopupOpen = open;
  if (!open) window.dispatchEvent(new Event(TIKTOK_POPUP_CLOSED_EVENT));
};
