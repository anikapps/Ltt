'use client';

import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  LockKeyhole,
  MapPin,
  Navigation,
  ShieldCheck,
  Users
} from 'lucide-react';
import MinimalNav from '@/components/MinimalNav';
import BrandIdentity from '@/components/BrandIdentity';

const JOIN_PATH = '/join';

const features = [
  {
    icon: MapPin,
    title: 'One shared live map',
    description: 'See the group at a glance, find meeting points, and open directions without switching between multiple tools.',
    tone: 'blue'
  },
  {
    icon: ShieldCheck,
    title: 'Help is always close',
    description: 'Travellers can raise a help request in seconds. The operations team gets the context it needs to respond.',
    tone: 'coral'
  },
  {
    icon: Users,
    title: 'A smoother group experience',
    description: 'Manage passenger lists, coach groups, headcounts, announcements, and trip information from one place.',
    tone: 'violet'
  },
  {
    icon: LockKeyhole,
    title: 'Privacy by design',
    description: 'Roster details stay protected. Location sharing is consent-based and travellers can pause it whenever they need.',
    tone: 'green'
  }
];

const steps = [
  { number: '01', title: 'Create the trip', text: 'Set up the tour, invite your team, and import the passenger roster.' },
  { number: '02', title: 'Share one invite', text: 'Send a secure link or QR code. Travellers verify against the approved roster.' },
  { number: '03', title: 'Travel in sync', text: 'Coordinate the group, share updates, and respond when someone needs help.' }
];

export default function HomePage() {
  return (
    <main className="ltt-home">
      <MinimalNav tripName="LTT BD" touristLabel="Group travel, in sync" />

      <section className="ltt-hero">
        <div className="ltt-hero-glow ltt-hero-glow-one" />
        <div className="ltt-hero-glow ltt-hero-glow-two" />
        <div className="ltt-hero-inner">
          <div className="ltt-hero-copy">
            <div className="ltt-eyebrow ltt-eyebrow-light">
              <span className="ltt-eyebrow-dot" />
              GROUP TRAVEL, MADE EASIER
            </div>
            <h1>Every traveller accounted for. <span>Every moment in sync.</span></h1>
            <p className="ltt-hero-lede">
              One calm, connected space for tour leaders and travellers to stay informed, find each other, and enjoy the journey.
            </p>
            <div className="ltt-hero-actions">
              <Link href={JOIN_PATH} className="ltt-button ltt-button-primary">
                Join your trip <ArrowRight size={17} />
              </Link>
              <Link href="/admin" className="ltt-button ltt-button-ghost">
                Open operations portal <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="ltt-hero-proof">
              <span><CheckCircle2 size={15} /> Simple for every traveller</span>
              <span><LockKeyhole size={15} /> Privacy-conscious by design</span>
            </div>
          </div>

          <div className="ltt-preview-wrap" aria-label="Illustrative preview of the LTT BD group dashboard">
            <div className="ltt-preview-topline">
              <BrandIdentity variant="light" compact tagline="" className="ltt-preview-brand" />
              <span className="ltt-preview-label">PRODUCT PREVIEW</span>
            </div>
            <div className="ltt-preview-card">
              <div className="ltt-preview-heading">
                <div>
                  <span className="ltt-preview-overline">YOUR GROUP AT A GLANCE</span>
                  <h2>Malaysia discovery tour</h2>
                  <p>Kuala Lumpur · Group overview</p>
                </div>
                <span className="ltt-preview-status"><span /> Sample view</span>
              </div>
              <div className="ltt-preview-stats">
                <div><strong>28</strong><span>Travellers</span></div>
                <div><strong>24</strong><span>Sharing</span></div>
                <div><strong>2</strong><span>Groups</span></div>
              </div>
              <div className="ltt-map-preview">
                <div className="ltt-map-grid" />
                <svg className="ltt-map-lines" viewBox="0 0 520 250" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M-20 190 C65 165 75 120 145 130 S245 205 300 160 410 90 545 110" />
                  <path d="M40 -20 C90 45 100 105 180 112 S280 85 340 25 430 15 490 70" />
                  <path d="M130 270 C175 210 180 180 235 150 S330 140 390 185 475 230 550 210" />
                  <path d="M270 -20 C255 35 260 88 300 130 S355 180 340 270" />
                  <path className="ltt-map-route" d="M92 170 C135 143 145 80 225 93 S322 165 394 104" />
                </svg>
                <div className="ltt-map-water" />
                <div className="ltt-map-pin ltt-map-pin-a"><span>R</span></div>
                <div className="ltt-map-pin ltt-map-pin-b"><span>N</span></div>
                <div className="ltt-map-pin ltt-map-pin-c"><span>A</span></div>
                <div className="ltt-map-meeting"><MapPin size={15} /></div>
                <div className="ltt-map-caption"><span className="ltt-map-caption-dot" /> Group map preview</div>
              </div>
              <div className="ltt-preview-bottom">
                <div className="ltt-preview-people">
                  <span className="ltt-avatar ltt-avatar-blue">R</span>
                  <span className="ltt-avatar ltt-avatar-teal">N</span>
                  <span className="ltt-avatar ltt-avatar-purple">A</span>
                  <span className="ltt-avatar ltt-avatar-more">+25</span>
                </div>
                <div className="ltt-preview-bottom-copy"><strong>Everyone in one place</strong><span>Map, updates, and trip support</span></div>
                <div className="ltt-preview-arrow"><ArrowUpRight size={18} /></div>
              </div>
            </div>
            <div className="ltt-preview-note"><BadgeCheck size={14} /> Example interface · not live passenger data</div>
          </div>
        </div>
        <div className="ltt-hero-bottomline"><span>BUILT FOR THE JOURNEY</span><span>Clear coordination. More confident travel.</span></div>
      </section>

      <section className="ltt-intro-strip">
        <div className="ltt-content-width ltt-intro-inner">
          <div><span className="ltt-kicker">ONE CONNECTED EXPERIENCE</span><h2>Less chasing updates.<br className="hidden sm:block" /> More time enjoying the trip.</h2></div>
          <p>From the first invitation to the final headcount, LTT BD brings the essentials of group travel coordination into one easy-to-use experience.</p>
        </div>
      </section>

      <section id="features" className="ltt-features-section">
        <div className="ltt-content-width">
          <div className="ltt-section-heading">
            <div><span className="ltt-kicker">THE RIGHT TOOLS, TOGETHER</span><h2>Everything the group needs.<br /><span>Nothing in the way.</span></h2></div>
            <p>Designed to feel intuitive for a first-time traveller and capable enough for a busy operations desk.</p>
          </div>
          <div className="ltt-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className={`ltt-feature-card ltt-feature-${feature.tone}`} key={feature.title}>
                  <div className="ltt-feature-icon"><Icon size={21} strokeWidth={2.1} /></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <span className="ltt-feature-line" />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="ltt-how-section">
        <div className="ltt-content-width ltt-how-layout">
          <div className="ltt-how-copy">
            <span className="ltt-kicker ltt-kicker-light">A SIMPLE FLOW</span>
            <h2>Ready before take-off.<br /><span>Connected all the way.</span></h2>
            <p>Set up once. Invite everyone. Keep the whole group moving together with a shared view of the journey.</p>
            <Link href="/admin" className="ltt-text-link">Explore the operations portal <ArrowUpRight size={17} /></Link>
          </div>
          <div className="ltt-step-list">
            {steps.map((step) => (
              <div className="ltt-step" key={step.number}>
                <span className="ltt-step-number">{step.number}</span>
                <div><h3>{step.title}</h3><p>{step.text}</p></div>
                <ArrowUpRight className="ltt-step-arrow" size={18} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ltt-trust-section">
        <div className="ltt-content-width ltt-trust-card">
          <div className="ltt-trust-icon"><LockKeyhole size={23} /></div>
          <div className="ltt-trust-copy"><span className="ltt-kicker">TRUST IS PART OF THE EXPERIENCE</span><h2>Helpful when you need it.<br /><span>Respectful of your privacy.</span></h2><p>Travellers verify using the details already held by the organiser. Personal roster identifiers are not shown to other travellers. GPS sharing requires consent and can be paused at any time.</p></div>
          <div className="ltt-trust-points"><div><CheckCircle2 size={17} /> Roster details stay protected</div><div><CheckCircle2 size={17} /> Location sharing is optional</div><div><CheckCircle2 size={17} /> Trip data can be purged after use</div></div>
        </div>
      </section>

      <section className="ltt-final-cta">
        <div className="ltt-content-width ltt-final-cta-inner">
          <div><span className="ltt-kicker ltt-kicker-light">YOUR JOURNEY, WELL CONNECTED</span><h2>Bring the whole group<br />a little closer.</h2><p>Join with your trip invitation or head to the operations portal to manage a tour.</p></div>
          <div className="ltt-final-cta-actions"><Link href={JOIN_PATH} className="ltt-button ltt-button-white">Join a trip <ArrowRight size={17} /></Link><Link href="/admin" className="ltt-button ltt-button-outline">Admin sign in <ArrowUpRight size={17} /></Link></div>
          <div className="ltt-cta-decoration"><Navigation size={150} strokeWidth={0.7} /></div>
        </div>
      </section>

      <footer className="ltt-footer">
        <div className="ltt-content-width ltt-footer-inner">
          <Link href="/" className="ltt-footer-brand" aria-label="LTT BD home"><BrandIdentity tagline="" compact /></Link>
          <p>Thoughtful tools for better group journeys.</p>
          <div className="ltt-footer-links"><Link href={JOIN_PATH}>Join a trip</Link><Link href="/admin">Operations portal</Link></div>
          <span className="ltt-footer-copy">© {new Date().getFullYear()} LTT BD</span>
        </div>
      </footer>
    </main>
  );
}
