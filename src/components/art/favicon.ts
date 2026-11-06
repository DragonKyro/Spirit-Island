// 64×64 favicon: an island under a rising spirit swirl. The same markup is inlined in
// index.html as a URL-encoded data: URI (keep the two in sync).
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="30" fill="#1d4a74" stroke="#1c130e" stroke-width="3"/>' +
  '<path d="M8 48q4-2.4 8 0M46 50q4-2.4 8 0" stroke="#8cc4ea" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
  '<path d="M6 44C13 38.5 19 36.5 24 36L31 25.5L35 30.5L38.5 27C44.5 31 52 36.5 58 44C48 50.5 16 50.5 6 44Z" fill="#5aa83e" stroke="#1c130e" stroke-width="2.6" stroke-linejoin="round"/>' +
  '<path d="M31 25.5L35 30.5L38.5 27L42 31C36 33 29 33.5 25 36Z" fill="#a39888"/>' +
  '<path d="M37.5 26C33.5 22.5 29.5 20 31 15C32.5 10.5 39.5 10 41.5 14C43 17.5 40 20.5 37 19.2C35 18.4 35.2 15.8 37 15.6" fill="none" stroke="#1c130e" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M37.5 26C33.5 22.5 29.5 20 31 15C32.5 10.5 39.5 10 41.5 14C43 17.5 40 20.5 37 19.2C35 18.4 35.2 15.8 37 15.6" fill="none" stroke="#ffd56a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

export const FAVICON_DATA_URI = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;
