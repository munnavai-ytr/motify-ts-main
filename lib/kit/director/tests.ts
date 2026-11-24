import type { VideoFormat } from '@/lib/types';

export interface DirectorTestFixture {
  id: number;
  label: string;
  format: VideoFormat;
  targetSeconds: number;
  text: string;
}

export const DEFAULT_CHECKED_FIXTURE_IDS: readonly number[] = [1, 3, 4, 6];

export const DIRECTOR_TEST_FIXTURES: readonly DirectorTestFixture[] = [
  {
    id: 1,
    label: 'Test fixture #1 — Coffee Roastery Reel (9:16)',
    format: '9:16',
    targetSeconds: 12,
    text: "15-second reel for a specialty coffee roastery 'Ember Bean' — 3 reasons our beans taste fresher",
  },
  {
    id: 2,
    label: 'Test fixture #2 — SaaS Explainer (16:9)',
    format: '16:9',
    targetSeconds: 14,
    text: "Product explainer for 'PulseLedger', an invoicing tool for freelancers: connect bank, auto-send invoices, track payouts",
  },
  {
    id: 3,
    label: 'Test fixture #3 — Bengali Bookstore Eid Offer (9:16)',
    format: '9:16',
    targetSeconds: 10,
    text: "ঢাকার অনলাইন বইয়ের দোকান 'কথামালা'-র জন্য ঈদ অফার রিল: সব গল্পের বইয়ে ২০% ছাড়, কোড EID20, আজই অর্ডার করুন",
  },
  {
    id: 4,
    label: 'Test fixture #4 — Architectural Exhibition Square (1:1)',
    format: '1:1',
    targetSeconds: 12,
    text: "Minimalist architectural studio 'Atelier Kanso' announcement: Spring Exhibition opening May 18 in Kyoto, quiet confidence",
  },
  {
    id: 5,
    label: 'Test fixture #5 — Broadcast Lower Third (16:9)',
    format: '16:9',
    targetSeconds: 5,
    text: 'Broadcast lower-third overlay on green screen for guest speaker Dr. Nadia Rahman, Chief Robotics Architect at AeroLab',
  },
  {
    id: 6,
    label: 'Test fixture #6 — Kids Coding Camp Reel (9:16)',
    format: '9:16',
    targetSeconds: 12,
    text: "Playful kids coding camp 'PixelSprouts' — weekend workshops for ages 8-12, build games in 4 Saturdays",
  },
  {
    id: 7,
    label: 'Test fixture #7 — Quarterly Metrics Recap (16:9)',
    format: '16:9',
    targetSeconds: 14,
    text: "Quarterly growth recap for 'VeloCloud': revenue up 142% YoY, Q1 $1.2M, Q2 $1.8M, Q3 $2.4M, Q4 $3.1M",
  },
  {
    id: 8,
    label: 'Test fixture #8 — Before vs After Compare (1:1)',
    format: '1:1',
    targetSeconds: 10,
    text: "Before vs After comparison for 'ClearDesk': Before = 14 tabs open, missed deadlines, manual notes; After = 1 workspace, 2x faster handoff, calm focus",
  },
  {
    id: 9,
    label: 'Test fixture #9 — Channel Intro Title Card (16:9)',
    format: '16:9',
    targetSeconds: 6,
    text: "Bold YouTube channel intro title card for 'Frame & Craft' — weekly cinematography breakdowns",
  },
  {
    id: 10,
    label: 'Test fixture #10 — Bengali Learning Steps (9:16)',
    format: '9:16',
    targetSeconds: 10,
    text: 'নতুনদের জন্য প্রতিদিন ১০ মিনিটে ইংরেজি শেখার ৩টি সহজ উপায় নিয়ে একটি সংক্ষিপ্ত ভিডিও',
  },
  {
    id: 11,
    label: 'Test fixture #11 — Vague Request / No-Hallucination Check (9:16)',
    format: '9:16',
    targetSeconds: 10,
    text: 'Make an awesome promo video for my business that blows people away',
  },
  {
    id: 12,
    label: 'Test fixture #12 — Photo/Footage/VO Boundary Check (16:9)',
    format: '16:9',
    targetSeconds: 12,
    text: "Luxury watch launch for 'Chronos Atelier' with 4K cinematic footage of titanium gears, epic orchestral music, and a warm baritone voiceover",
  },
];
