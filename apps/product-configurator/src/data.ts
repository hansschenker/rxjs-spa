// ---------------------------------------------------------------------------
// Product data — SoundFlow Pro Wireless Headphones
// ---------------------------------------------------------------------------

export interface Color {
  id: string
  name: string
  hex: string
  stock: 'in-stock' | 'limited' | 'out-of-stock'
  stockCount?: number
}

export interface Size {
  id: string
  name: string
  description: string
  priceAdd: number
}

export interface Addon {
  id: string
  name: string
  description: string
  price: number
}

export interface Review {
  id: string
  author: string
  avatar: string
  rating: number
  date: string
  title: string
  body: string
  verified: boolean
}

export interface SpecRow {
  label: string
  standard: string
  pro: string
}

export interface SpecGroup {
  category: string
  rows: SpecRow[]
}

export interface GalleryView {
  label: string
  angle: string
}

// ---------------------------------------------------------------------------

export const PRODUCT = {
  name: 'SoundFlow Pro',
  tagline: 'Wireless Noise-Cancelling Headphones',
  basePrice: 199,
  rating: 4.7,
  reviewCount: 124,
  sku: 'SFP-WH-001',
}

export const COLORS: Color[] = [
  { id: 'black', name: 'Midnight Black', hex: '#1a1a2e', stock: 'in-stock' },
  { id: 'white', name: 'Pearl White',    hex: '#d4cfc8', stock: 'in-stock' },
  { id: 'gray',  name: 'Space Gray',     hex: '#5c6370', stock: 'limited', stockCount: 3 },
  { id: 'navy',  name: 'Navy Blue',      hex: '#1e3a5f', stock: 'out-of-stock' },
]

export const SIZES: Size[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: '40 mm · 30 h ANC battery',
    priceAdd: 0,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: '50 mm · 50 h ANC · LDAC',
    priceAdd: 50,
  },
]

export const ADDONS: Addon[] = [
  { id: 'case',     name: 'Carrying Case',        description: 'Hard-shell protective case',      price: 29 },
  { id: 'cable',    name: '3 m Braided Cable',     description: 'Premium 3-metre braided cable',   price: 15 },
  { id: 'cushions', name: 'Memory Foam Cushions',  description: 'Ultra-soft replacement ear pads', price: 19 },
  { id: 'kit',      name: 'Cleaning Kit',          description: '6-piece audio care kit',          price: 12 },
]

export const REVIEWS: Review[] = [
  {
    id: '1',
    author: 'Alex M.',
    avatar: 'AM',
    rating: 5,
    date: 'Jan 15, 2026',
    title: 'Best headphones I\'ve ever owned',
    body: 'The noise cancellation is phenomenal. I use these every day for work and they\'re a game-changer. Battery life easily lasts two full workdays.',
    verified: true,
  },
  {
    id: '2',
    author: 'Sarah K.',
    avatar: 'SK',
    rating: 4,
    date: 'Dec 28, 2025',
    title: 'Great sound, slightly heavy',
    body: 'Sound quality is outstanding, especially in Pro mode with LDAC. Slightly heavier than my previous pair but you get used to it quickly.',
    verified: true,
  },
  {
    id: '3',
    author: 'James R.',
    avatar: 'JR',
    rating: 5,
    date: 'Nov 10, 2025',
    title: 'Worth every penny',
    body: 'Picked up Space Gray with the carrying case — perfect travel companion. Build quality feels genuinely premium for the price.',
    verified: false,
  },
  {
    id: '4',
    author: 'Priya N.',
    avatar: 'PN',
    rating: 4,
    date: 'Oct 22, 2025',
    title: 'Excellent ANC, great companion app',
    body: 'The app lets you dial in custom EQ profiles and the ANC is competitive with brands costing twice as much. Highly recommend the memory foam cushion add-on.',
    verified: true,
  },
]

export const SPECS: SpecGroup[] = [
  {
    category: 'Audio',
    rows: [
      { label: 'Driver Size',         standard: '40 mm dynamic',    pro: '50 mm dynamic' },
      { label: 'Frequency Response',  standard: '20 – 20,000 Hz',   pro: '20 – 40,000 Hz' },
      { label: 'Codec Support',        standard: 'SBC, AAC',         pro: 'SBC, AAC, LDAC, aptX HD' },
      { label: 'Noise Cancellation',   standard: 'Hybrid ANC',       pro: 'Adaptive ANC+' },
    ],
  },
  {
    category: 'Battery',
    rows: [
      { label: 'Playback (ANC on)',  standard: '30 hours',        pro: '50 hours' },
      { label: 'Playback (ANC off)', standard: '40 hours',        pro: '65 hours' },
      { label: 'Charge Time',        standard: '2 h (USB-C)',     pro: '2.5 h (USB-C)' },
      { label: 'Fast Charge',        standard: '10 min → 3 h',    pro: '10 min → 5 h' },
    ],
  },
  {
    category: 'Connectivity',
    rows: [
      { label: 'Bluetooth',    standard: '5.2',         pro: '5.3' },
      { label: 'Range',        standard: 'Up to 10 m',  pro: 'Up to 15 m' },
      { label: 'Multipoint',   standard: '2 devices',   pro: '4 devices' },
      { label: 'Wired Input',  standard: '3.5 mm jack', pro: '3.5 mm + USB-C audio' },
    ],
  },
  {
    category: 'Physical',
    rows: [
      { label: 'Weight',     standard: '250 g',              pro: '280 g' },
      { label: 'Foldable',   standard: 'Yes',                pro: 'Yes' },
      { label: 'IP Rating',  standard: 'IPX4',               pro: 'IPX5' },
      { label: 'Mic System', standard: 'Dual beamforming',   pro: 'Quad beamforming' },
    ],
  },
]

export const GALLERY_VIEWS: GalleryView[] = [
  { label: 'Hero',      angle: 'Front view' },
  { label: 'Profile',   angle: 'Side profile' },
  { label: 'Folded',    angle: 'Folded compact' },
  { label: 'Detail',    angle: 'Ear cup detail' },
  { label: 'Lifestyle', angle: 'On-ear lifestyle' },
]
