/**
 * Names for places this build no longer carries.
 *
 * A diary is a record of where someone has been. When the dataset underneath
 * it changed from Hong Kong to the Bay Area, every visit stamped before the
 * switch lost the place it pointed at and rendered as "Unknown place" — the
 * memory intact, its subject erased. That is the diary quietly failing at the
 * one job it has.
 *
 * These 41 names are the Hong Kong seed's own, matched to the ids by slug
 * (`Tai Cheong Bakery` → `tai-cheong-bakery`), which is how those ids were
 * formed. Names only. No coordinates, hours or themes: this build does not
 * carry Hong Kong and will not invent a location to put a stamp on a map.
 * A visit resolved here can be read and remembered, not planned around.
 *
 * Consulted last, after the live dataset and after the name the visit stored
 * for itself. New stamps carry their own name (see Visit.placeName), so this
 * table only ever serves visits written before that existed and cannot grow.
 */
export const LEGACY_PLACE_NAMES: Record<string, string> = {
  '1881-heritage': '1881 Heritage',
  'apliu-street-flea-market': 'Apliu Street Flea Market',
  'australia-dairy-company': 'Australia Dairy Company',
  'bras-basar-shanghai-street-kitchenware': 'Bras Basar / Shanghai Street Kitchenware',
  'cat-street-upper-lascar-row': 'Cat Street (Upper Lascar Row)',
  'central-mid-levels-escalator': 'Central–Mid-Levels Escalator',
  'chungking-mansions': 'Chungking Mansions',
  'din-tai-fung-tsim-sha-tsui': 'Din Tai Fung (Tsim Sha Tsui)',
  'flower-market-and-yuen-po-bird-garden': 'Flower Market & Yuen Po Bird Garden',
  'golden-computer-arcade': 'Golden Computer Arcade',
  'harbour-city': 'Harbour City',
  'hollywood-road-antique-shops': 'Hollywood Road Antique Shops',
  'hong-kong-museum-of-history': 'Hong Kong Museum of History',
  'jardines-crescent-market': 'Jardine\'s Crescent Market',
  'k11-musea': 'K11 MUSEA',
  'kai-kai-dessert': 'Kai Kai Dessert',
  'kowloon-park': 'Kowloon Park',
  'kung-wo-tofu-factory': 'Kung Wo Tofu Factory',
  'ladies-market': 'Ladies\' Market',
  'lan-fong-yuen': 'Lan Fong Yuen',
  'langham-place': 'Langham Place',
  'lei-yue-mun-seafood-day-trip-note': 'Lei Yue Mun Seafood (day-trip note)',
  'maks-noodle-central': 'Mak\'s Noodle (Central)',
  'man-mo-temple': 'Man Mo Temple',
  'mido-cafe': 'Mido Cafe',
  'noon-day-gun': 'Noon Day Gun',
  'pmq': 'PMQ',
  'sham-shui-po-fabric-and-bead-market-ki-lung-street': 'Sham Shui Po Fabric & Bead Market (Ki Lung Street)',
  'sneaker-street-fa-yuen-street': 'Sneaker Street (Fa Yuen Street)',
  'sogo-causeway-bay': 'SOGO Causeway Bay',
  'star-ferry-central-pier': 'Star Ferry (Central Pier)',
  'tai-cheong-bakery': 'Tai Cheong Bakery',
  'tai-kwun': 'Tai Kwun',
  'temple-street-night-market': 'Temple Street Night Market',
  'the-peak-tram-and-victoria-peak': 'The Peak Tram & Victoria Peak',
  'tim-ho-wan-mong-kok-origin': 'Tim Ho Wan (Mong Kok origin)',
  'tim-ho-wan-sham-shui-po': 'Tim Ho Wan (Sham Shui Po)',
  'times-square-causeway-bay': 'Times Square (Causeway Bay)',
  'tsim-sha-tsui-promenade-and-avenue-of-stars': 'Tsim Sha Tsui Promenade & Avenue of Stars',
  'victoria-park': 'Victoria Park',
  'yung-kee-restaurant': 'Yung Kee Restaurant',
};
